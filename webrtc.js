// Configuração dos servidores STUN/TURN públicos
const configuration = {
  iceServers: [
    // Servidores STUN
    { 
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ] 
    },
    
    // Servidores TURN gratuitos para casos de NAT restrito
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    
    // Servidores TURN adicionais com credenciais
    {
      urls: [
        'turn:relay.metered.ca:80',
        'turn:relay.metered.ca:443',
        'turn:relay.metered.ca:443?transport=tcp'
      ],
      username: 'e8d34faf7cb62de234b299da',
      credential: 'uGP8+dMDCQIK+DRo'
    }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all' // usar 'relay' se quiser forçar TURN
};

// URL do servidor de sinalização (Cloudflare Worker)
const SIGNALING_SERVER = 'https://webrtc-signaling.mosaicoworkers.workers.dev'; // URL do servidor de sinalização (sem a barra no final)

// Variáveis globais
let peerConnections = {}; // Armazena conexões peer
let localStream;
let roomId;
let userId;
let username;
let isPolling = false;
let lastPollTime = 0;
let makingOffer = {}; // Flag para controlar ofertas em andamento por peerId

// Variável para armazenar status de áudio e vídeo
let audioStatus = true;
let videoStatus = true;

// Canal de dados para transmitir status do microfone/câmera entre participantes
// let dataChannels = {}; // Esta variável não parece ser usada globalmente, cada pc tem seu dataChannel

// Log personalizado
function log(message) {
  console.log(`[WebRTC ${new Date().toLocaleTimeString()}] ${message}`);
}

// Gera um ID aleatório
function generateRandomId() {
  return Math.random().toString(36).substr(2, 9);
}

// Função para conectar à sala WebRTC
export async function connectToRoom(room, stream, addRemoteVideo) {
  roomId = room;
  userId = generateRandomId();
  username = localStorage.getItem('userName') || 'Anônimo';
  localStream = stream;
  
  console.log(`Conectando à sala ${roomId} como ${username} (ID: ${userId})`);
  
  // Registrar na sala
  try {
    const response = await fetch(`${SIGNALING_SERVER}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ room: roomId, id: userId, name: username })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`Conectado ao servidor de sinalização`, data);
      
      const sortedUsers = [...data.users].sort((a, b) => a.id.localeCompare(b.id));
      
      sortedUsers.forEach(user => {
        if (user.id !== userId) {
          const shouldInitiate = userId < user.id;
          console.log(`Detectado usuário: ${user.name} (${user.id}), iniciando: ${shouldInitiate}`);
          createPeerConnection(user.id, user.name, shouldInitiate, addRemoteVideo);
        }
      });
      
      startPolling(addRemoteVideo);
      
      return true;
    } else {
      console.error('Falha ao conectar ao servidor de sinalização');
      return false;
    }
  } catch (error) {
    console.error('Erro ao conectar ao servidor de sinalização:', error);
    return false;
  }
}

// Função para iniciar polling melhorada
function startPolling(addRemoteVideo) {
  if (isPolling) return;
  
  console.log("Iniciando polling para atualizações");
  isPolling = true;
  lastPollTime = Date.now() - 30000; 
  
  async function poll() {
    if (!isPolling) return;
    
    try {
      const response = await fetch(`${SIGNALING_SERVER}/poll?room=${roomId}&id=${userId}&last=${lastPollTime}`);
      const data = await response.json();
      
      if (data.success) {
        // console.log(`Poll: ${data.users.length} usuários, ${data.signals?.length || 0} sinais`);
        // console.log("Usuários na sala:", data.users);
        
        data.users.forEach(user => {
          if (user.id !== userId && !peerConnections[user.id]) {
            console.log(`Novo usuário via poll: ${user.name} (${user.id})`);
            // Ao encontrar novo usuário via poll, o peer com ID menor inicia
            const shouldInitiate = userId < user.id;
            createPeerConnection(user.id, user.name, shouldInitiate, addRemoteVideo);
          }
        });
        
        if (data.signals && data.signals.length > 0) {
          console.log("Sinais recebidos:", data.signals);
          data.signals.forEach(signal => {
            handleSignal(signal, addRemoteVideo);
          });
        }
        
        lastPollTime = Date.now();
      }
    } catch (error) {
      console.error("Erro durante polling:", error);
    }
    
    setTimeout(poll, 2000);
  }
  
  poll();
}

// Processa sinais recebidos
async function handleSignal(signal, addRemoteVideo) {
  const { type, sender, data: signalData, name: senderName } = signal;
  const localIdForLog = userId || 'local';

  console.log(`[${localIdForLog}] Processando sinal ${type} de ${sender}`);
  
  if (!peerConnections[sender] && type === 'offer') {
    console.log(`[${localIdForLog}] Criando nova conexão para ${sender} (${senderName || 'nome desconhecido'}) após receber oferta. Não serei o iniciador.`);
    createPeerConnection(sender, senderName || null, false, addRemoteVideo); // Não iniciador, pois estamos respondendo a uma oferta
  } else if (!peerConnections[sender]) {
    // Para outros tipos de sinais (ex: answer, candidate) se a conexão não existir, pode ser um problema.
    // No entanto, a lógica de criação de conexão no poll/join deve cobrir a maioria dos casos.
    // Se for um candidato chegando antes da oferta, ele será armazenado.
    console.log(`[${localIdForLog}] Conexão com ${sender} não existe ainda, mas recebido sinal ${type}. Será tratada se for candidato ou se oferta criar a conexão.`);
  }
  
  const pc = peerConnections[sender];
  if (!pc && type !== 'candidate') { // Candidatos podem ser armazenados antes da conexão estar totalmente pronta
    console.error(`[${localIdForLog}] Conexão com ${sender} não encontrada ao processar sinal ${type}. Sinal ignorado.`);
    return;
  }
  
  try {
    if (type === 'offer') {
      if (!pc) { // Garante que pc existe, especialmente se criado dentro deste if
          console.error(`[${localIdForLog}] PC para ${sender} não foi criado a tempo para oferta. Abortando.`);
          return;
      }
      console.log(`[${localIdForLog}] Recebeu oferta de ${sender}. Estado atual: ${pc.signalingState}`);
      
      const offerCollision = pc.signalingState === 'have-local-offer';
      let polite = userId > sender; // Nosso ID é maior = somos polite

      if (offerCollision) {
        if (polite) {
          console.log(`[${localIdForLog}] Colisão de ofertas com ${sender}. Somos "polite", recuando nossa oferta.`);
          await pc.setLocalDescription({ type: 'rollback' });
          console.log(`[${localIdForLog}] Estado após rollback para ${sender}: ${pc.signalingState}`);
        } else {
          console.log(`[${localIdForLog}] Colisão de ofertas com ${sender}. Somos "impolite", ignorando oferta remota.`);
          return; 
        }
      }
      
      if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') { // A segunda condição é após rollback
        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        console.log(`[${localIdForLog}] Descrição remota (oferta de ${sender}) definida. Estado: ${pc.signalingState}`);
      
        console.log(`[${localIdForLog}] Criando resposta para ${sender}`);
        const answer = await pc.createAnswer();
        console.log(`[${localIdForLog}] Resposta para ${sender} criada. Estado antes de setLocalDescription(answer): ${pc.signalingState}`);
      
        if (pc.signalingState === 'have-remote-offer') {
          await pc.setLocalDescription(answer);
          console.log(`[${localIdForLog}] Descrição local (resposta para ${sender}) definida. Estado: ${pc.signalingState}`);
          console.log(`[${localIdForLog}] Enviando resposta para ${sender}`);
          sendSignal(sender, 'answer', answer);
        } else {
          console.warn(`[${localIdForLog}] IMPEDIDO de setLocalDescription(answer) para ${sender}. Estado atual: ${pc.signalingState}, esperado: 'have-remote-offer'.`);
        }
      } else {
        console.warn(`[${localIdForLog}] IMPEDIDO de setRemoteDescription(offer) para ${sender}. Estado atual: ${pc.signalingState}, esperado: 'stable' ou 'have-remote-offer'.`);
      }

    } else if (type === 'answer') {
      if (!pc) {
          console.error(`[${localIdForLog}] Conexão com ${sender} não encontrada ao processar RESPOSTA. Sinal ignorado.`);
          return;
      }
      console.log(`[${localIdForLog}] Recebeu resposta de ${sender}. Estado atual: ${pc.signalingState}`);
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        console.log(`[${localIdForLog}] Descrição remota (resposta de ${sender}) definida. Estado: ${pc.signalingState}`);
      } else {
        console.warn(`[${localIdForLog}] Resposta de ${sender} ignorada. Estado atual: ${pc.signalingState}, esperado: 'have-local-offer'.`);
      }
    } else if (type === 'candidate') {
      console.log(`[${localIdForLog}] Recebeu candidato ICE de ${sender}`);
      // Se pc não existe ainda, criamos um objeto temporário para armazenar candidatos
      if (!peerConnections[sender]) {
          console.log(`[${localIdForLog}] Conexão com ${sender} não existe, criando placeholder para candidatos.`);
          peerConnections[sender] = { pendingCandidates: [] }; // Placeholder
      }
      const currentPC = peerConnections[sender]; // Pode ser o placeholder ou o RTCPeerConnection real

      try {
        // Se for um RTCPeerConnection real e tiver remoteDescription, ou se não tiver remoteDescription (estado inicial)
        if (currentPC.addIceCandidate && (currentPC.remoteDescription || currentPC.signalingState === 'stable')) {
            await currentPC.addIceCandidate(new RTCIceCandidate(signalData));
        } else {
          console.log(`[${localIdForLog}] Armazenando candidato ICE de ${sender} para mais tarde (estado: ${currentPC.signalingState}, remoteDesc: ${!!currentPC.remoteDescription})`);
          if (!currentPC.pendingCandidates) currentPC.pendingCandidates = [];
          currentPC.pendingCandidates.push(signalData);
        }
      } catch (e) {
        // Não registrar erro se remoteDescription não estiver definido, pois é esperado armazenar o candidato
        if (currentPC.remoteDescription) {
          console.error(`[${localIdForLog}] Erro ao adicionar candidato ICE de ${sender}: ${e.message}`);
        } else {
          console.log(`[${localIdForLog}] Armazenando candidato ICE de ${sender} para mais tarde (após erro): ${e.message}`);
          if (!currentPC.pendingCandidates) currentPC.pendingCandidates = [];
          currentPC.pendingCandidates.push(signalData);
        }
      }
    }
  } catch (error) {
    console.error(`[${localIdForLog}] Erro ao processar sinal ${type} de ${sender}: ${error.message}`, error);
  }
}

// Envia um sinal para outro peer
async function sendSignal(target, type, data) {
  const localIdForLog = userId || 'local';
  try {
    // log(`[${localIdForLog}] Enviando sinal ${type} para ${target}`); // Log mais detalhado já está no createAndSendOffer ou similar
    const response = await fetch(`${SIGNALING_SERVER}/signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        room: roomId, // Adicionar roomId para o worker poder rotear corretamente
        sender: userId,
        name: username, // Enviar nome do remetente
        target,
        type,
        data
      })
    });
    
    const result = await response.json();
    if (result.success) {
      log(`[${localIdForLog}] Sinal ${type} enviado com sucesso para ${target}`);
    } else {
      log(`[${localIdForLog}] Falha ao enviar sinal ${type} para ${target}: ${result.error || 'Erro desconhecido no servidor'}`);
    }
  } catch (error) {
    log(`[${localIdForLog}] Erro de rede ao enviar sinal ${type} para ${target}: ${error.message}`);
  }
}

function createPeerConnection(peerId, peerName, initiator, addRemoteVideo) {
  const localIdForLog = userId || 'local';
  if (peerConnections[peerId] && peerConnections[peerId].signalingState) { // Verifica se é um PC real
    console.log(`[${localIdForLog}] Conexão com ${peerId} já existe. Retornando existente.`);
    return peerConnections[peerId];
  }
  
  console.log(`[${localIdForLog}] Criando conexão com peer ${peerId} (${peerName || 'sem nome'})${initiator ? ' (como iniciador)' : ''}`);
  
  const pc = new RTCPeerConnection({
    ...configuration,
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  });

  // Se havia candidatos pendentes para este peerId (de um placeholder)
  const existingPlaceholder = peerConnections[peerId];
  if (existingPlaceholder && existingPlaceholder.pendingCandidates) {
      pc.pendingCandidates = [...existingPlaceholder.pendingCandidates];
  }
  
  peerConnections[peerId] = pc;
  
  if (localStream) {
    console.log(`[${localIdForLog}] Adicionando ${localStream.getTracks().length} tracks locais à conexão com ${peerId}`);
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  pc.onicecandidate = event => {
    if (event.candidate) {
      // console.log(`[${localIdForLog}] Enviando candidato ICE para ${peerId}: ${event.candidate.candidate.substr(0, 50)}...`);
      sendSignal(peerId, 'candidate', event.candidate);
    } else {
      console.log(`[${localIdForLog}] Coleta de candidatos ICE para ${peerId} concluída`);
    }
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log(`[${localIdForLog}] Estado ICE para ${peerId}: ${pc.iceConnectionState}`);
    
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log(`[${localIdForLog}] Conexão ICE estabelecida com ${peerId}!`);
      if (pc.iceRetryTimer) {
        clearTimeout(pc.iceRetryTimer);
        pc.iceRetryTimer = null;
      }
      // Processar candidatos pendentes agora que a conexão está mais estável
      if (pc.pendingCandidates && pc.remoteDescription) {
          console.log(`[${localIdForLog}] Processando ${pc.pendingCandidates.length} candidatos ICE pendentes para ${peerId}`);
          pc.pendingCandidates.forEach(candidate => {
              pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(`[${localIdForLog}] Erro ao adicionar candidato pendente para ${peerId}: ${e.message}`));
          });
          delete pc.pendingCandidates;
      }
    }
    
    if (pc.iceConnectionState === 'failed') {
      console.log(`[${localIdForLog}] Conexão ICE com ${peerId} falhou, tentando reiniciar ICE`);
      pc.iceRetryCount = (pc.iceRetryCount || 0) + 1;
      
      if (pc.iceRetryCount <= 3) { // Reduzido para 3 tentativas
        const delay = Math.pow(2, pc.iceRetryCount) * 1000;
        console.log(`[${localIdForLog}] Tentativa ICE ${pc.iceRetryCount} para ${peerId}, aguardando ${delay/1000}s`);
        
        pc.iceRetryTimer = setTimeout(async () => {
          if (pc.signalingState === 'closed') {
              console.log(`[${localIdForLog}] Conexão com ${peerId} já fechada, não tentando reiniciar ICE.`);
              return;
          }
          pc.restartIce();
          // Apenas o iniciador original da *relação* tenta uma nova oferta em falha de ICE.
          // A flag 'initiator' aqui é a da criação da conexão.
          if (initiator) { 
            console.log(`[${localIdForLog}] Tentando nova oferta para ${peerId} após falha ICE. makingOffer: ${!!makingOffer[peerId]}, state: ${pc.signalingState}`);
            if (makingOffer[peerId]) {
              console.log(`[${localIdForLog}] Negociação para ${peerId} já em andamento (makingOffer=true) durante retry ICE. Não enviando nova oferta.`);
              return;
            }
            if (pc.signalingState === 'stable') {
              makingOffer[peerId] = true;
              try {
                await createAndSendOffer(pc, peerId);
              } finally {
                makingOffer[peerId] = false;
              }
            } else {
              console.log(`[${localIdForLog}] Não tentando nova oferta para ${peerId} após falha ICE, estado não é stable: ${pc.signalingState}`);
            }
          }
        }, delay);
      } else {
        console.warn(`[${localIdForLog}] Desistindo de conectar ICE com ${peerId} após ${pc.iceRetryCount} tentativas`);
      }
    }
    
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
      if (pc.iceRetryTimer) {
        clearTimeout(pc.iceRetryTimer);
        pc.iceRetryTimer = null;
      }
      if (pc.iceConnectionState === 'disconnected' && !pc.disconnectTimer) {
        pc.disconnectTimer = setTimeout(() => {
          console.log(`[${localIdForLog}] Desconexão ICE persistente de ${peerId}, fechando conexão`);
          if (peerConnections[peerId]) {
            pc.close(); // Isso deve mudar o signalingState para 'closed'
            delete peerConnections[peerId];
            // Notificar UI
            const event = new CustomEvent('peer-disconnected', { detail: { peerId: peerId } });
            window.dispatchEvent(event);
          }
        }, 8000); // Aumentado para 8s
      } else if (pc.iceConnectionState === 'closed') {
          // Se já está fechado, garantir que foi removido
          if (peerConnections[peerId]) {
              delete peerConnections[peerId];
              const event = new CustomEvent('peer-disconnected', { detail: { peerId: peerId } });
              window.dispatchEvent(event);
          }
      }
    }
    
    if (pc.disconnectTimer && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) {
      clearTimeout(pc.disconnectTimer);
      pc.disconnectTimer = null;
      console.log(`[${localIdForLog}] Reconectado ICE com ${peerId}`);
    }
  };
  
  if (initiator) {
    const dataChannel = pc.createDataChannel('status');
    setupDataChannel(dataChannel, peerId, pc);
  } else {
    pc.ondatachannel = (event) => {
      const dataChannel = event.channel;
      setupDataChannel(dataChannel, peerId, pc);
    };
  }
  
  function setupDataChannel(dataChannel, chPeerId, ownerPC) {
    ownerPC.dataChannel = dataChannel; // Associar ao PC
    dataChannel.onopen = () => {
      console.log(`[${localIdForLog}] Canal de dados aberto para ${chPeerId}`);
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'media-status', audio: audioStatus, video: videoStatus }));
      }
    };
    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'media-status') {
          updateRemoteMediaUI(chPeerId, data.audio, data.video);
          const statusEvent = new CustomEvent('remote-media-status', { detail: { peerId: chPeerId, audio: data.audio, video: data.video } });
          window.dispatchEvent(statusEvent);
        }
      } catch (e) {
        console.error(`[${localIdForLog}] Erro ao processar mensagem de dados de ${chPeerId}:`, e);
      }
    };
    dataChannel.onerror = (error) => {
      console.error(`[${localIdForLog}] Erro no canal de dados para ${chPeerId}:`, error);
    };
    dataChannel.onclose = () => {
      console.log(`[${localIdForLog}] Canal de dados fechado para ${chPeerId}`);
    };
  }
  
  pc.onnegotiationneeded = async () => {
    const localIdForLog = userId || 'local';
    log(`[${localIdForLog}] Negociação necessária para ${peerId}. Estado atual: ${pc.signalingState}, makingOffer: ${!!makingOffer[peerId]}`);
    
    if (makingOffer[peerId]) {
      log(`[${localIdForLog}] Negociação para ${peerId} já em andamento (makingOffer[peerId]=true). Ignorando onnegotiationneeded.`);
      return;
    }

    // Apenas se o estado for 'stable' podemos iniciar uma nova oferta.
    // A lógica de 'initiator' original é menos relevante para renegociações;
    // qualquer lado pode precisar renegociar (ex: ao adicionar uma track).
    // A polidez em handleSignal resolverá colisões se ambos tentarem ao mesmo tempo.
    if (pc.signalingState === 'stable') {
      log(`[${localIdForLog}] Iniciando negociação com ${peerId} via onnegotiationneeded (estado stable).`);
      makingOffer[peerId] = true;
      try {
        await createAndSendOffer(pc, peerId);
      } catch (e) {
          log(`[${localIdForLog}] Erro durante createAndSendOffer originado de onnegotiationneeded para ${peerId}: ${e.message}`);
      } finally {
        makingOffer[peerId] = false;
      }
    } else {
      log(`[${localIdForLog}] Negociação necessária para ${peerId}, mas não iniciando oferta. Estado: ${pc.signalingState}`);
    }
  };
  
  pc.onconnectionstatechange = () => {
    log(`[${localIdForLog}] Estado da conexão com ${peerId}: ${pc.connectionState}`);
    const event = new CustomEvent('peer-connection-state', { detail: { peerId: peerId, state: pc.connectionState } });
    window.dispatchEvent(event);
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        if (peerConnections[peerId]) {
            pc.close();
            delete peerConnections[peerId];
             const disconnectEvent = new CustomEvent('peer-disconnected', { detail: { peerId: peerId } });
            window.dispatchEvent(disconnectEvent);
        }
    }
  };
  
  pc.ontrack = event => {
    log(`[${localIdForLog}] Recebeu track de ${peerId}: ${event.track.kind}`);
    const stream = event.streams && event.streams[0];
    if (!stream) {
        log(`[${localIdForLog}] Track recebida de ${peerId} sem stream associado. Criando stream sintético.`);
        const syntheticStream = new MediaStream([event.track]);
        if (addRemoteVideo && typeof addRemoteVideo === 'function') {
            addRemoteVideo(syntheticStream, peerId, peerName || 'Remoto');
        }
        return;
    }

    // Verificar se já temos o stream para este peer (pode acontecer com renegotiation)
    // pc.remoteStreams é um array, não um objeto. getRemoteStreams() retorna o array.
    const existingRemoteStreams = pc.getRemoteStreams();
    if (existingRemoteStreams.some(s => s.id === stream.id)) {
      console.log(`[${localIdForLog}] Stream ${stream.id} de ${peerId} já registrado, não adicionando novamente.`);
      return;
    }
    
    console.log(`[${localIdForLog}] Processando stream remoto ${stream.id} de ${peerId}`);
    if (addRemoteVideo && typeof addRemoteVideo === 'function') {
      addRemoteVideo(stream, peerId, peerName || 'Remoto');
    }
    event.track.onended = () => {
      log(`[${localIdForLog}] Track ${event.track.kind} terminada de ${peerId}`);
    };
  };
  
  return pc;
}

async function createAndSendOffer(pc, peerId) {
  const localIdForLog = userId || 'local';
  if (pc.signalingState !== 'stable') {
    log(`[${localIdForLog}] Não criando oferta para ${peerId}, estado de sinalização é ${pc.signalingState} (não stable).`);
    return;
  }
  try {
    log(`[${localIdForLog}] Criando oferta para ${peerId}`);
    const offer = await pc.createOffer();
    
    if (pc.signalingState !== 'stable') {
        log(`[${localIdForLog}] Estado mudou para ${pc.signalingState} após createOffer para ${peerId}. Abortando setLocalDescription.`);
        return;
    }
    await pc.setLocalDescription(offer);
    
    if (pc.signalingState !== 'have-local-offer') {
        log(`[${localIdForLog}] Estado mudou para ${pc.signalingState} após setLocalDescription para ${peerId}. Abortando envio da oferta.`);
        return;
    }
    log(`[${localIdForLog}] Descrição local (oferta) definida para ${peerId}. Enviando.`);
    sendSignal(peerId, 'offer', pc.localDescription);
  } catch (error) {
    log(`[${localIdForLog}] Erro ao criar/enviar oferta para ${peerId}: ${error.message}`);
    // Reset makingOffer flag if it was set by the caller, though ideally caller handles its own try/finally
    // makingOffer[peerId] = false; // CUIDADO: Isso pode ser problemático se createAndSendOffer for chamado sem makingOffer ser gerenciado externamente.
                                 // A flag makingOffer agora é gerenciada pelo chamador (onnegotiationneeded, retry ICE)
  }
}

export function disconnect() {
  log("Desconectando de todas as chamadas");
  isPolling = false;
  
  Object.values(peerConnections).forEach(pc => {
      if (pc && typeof pc.close === 'function') {
          pc.close();
      }
  });
  peerConnections = {};
  makingOffer = {}; // Resetar flags de oferta
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  log("Desconectado");
}

function ensureVideoIsVisible(video, peerId) {
  let attempts = 0;
  const maxAttempts = 35; 
  const interval = 250; 
  const localIdForLog = userId || 'local';

  log(`[${localIdForLog}][VideoCheck ${peerId}] Iniciando. Muted: ${video.muted}, Paused: ${video.paused}, ReadyState: ${video.readyState}`);

  const checkVideo = setInterval(() => {
    attempts++;
    
    if (!document.body.contains(video)) {
        log(`[${localIdForLog}][VideoCheck ${peerId}] Elemento não está no DOM. Interrompendo.`);
        clearInterval(checkVideo);
        return;
    }

    const styles = window.getComputedStyle(video);
    const isElementVisible = styles.display !== 'none' && styles.visibility !== 'hidden' && video.offsetParent !== null && video.clientWidth > 0 && video.clientHeight > 0;
    const hasVideoData = video.readyState >= 2; 
    const hasDimensions = video.videoWidth > 0 && video.videoHeight > 0;

    // log(`[${localIdForLog}][VideoCheck ${peerId} Tentativa ${attempts}/${maxAttempts}] State: ${video.readyState}, W: ${video.videoWidth}, H: ${video.videoHeight}, Paused: ${video.paused}, VisibleDOM: ${isElementVisible}, HasData: ${hasVideoData}, HasDims: ${hasDimensions}`);

    if (hasVideoData && hasDimensions && isElementVisible && !video.paused) {
      log(`[${localIdForLog}][VideoCheck ${peerId}] Vídeo visível e reproduzindo.`);
      clearInterval(checkVideo);
      const event = new CustomEvent('video-active', { detail: { peerId: peerId } });
      window.dispatchEvent(event);
    } else if (attempts >= maxAttempts) {
      log(`[${localIdForLog}][VideoCheck ${peerId}] Desistindo após ${maxAttempts} tentativas. Estado final - State: ${video.readyState}, W: ${video.videoWidth}, H: ${video.videoHeight}, Paused: ${video.paused}, VisibleDOM: ${isElementVisible}`);
      clearInterval(checkVideo);
      if (isElementVisible && video.srcObject && video.srcObject.getVideoTracks().length === 0) {
          log(`[${localIdForLog}][VideoCheck ${peerId}] Stream não contém faixas de vídeo.`);
      } else if (isElementVisible && video.paused) {
          log(`[${localIdForLog}][VideoCheck ${peerId}] Vídeo permaneceu pausado.`);
      }
    } else if (isElementVisible && video.paused && hasVideoData) {
        log(`[${localIdForLog}][VideoCheck ${peerId}] Pausado mas com dados/visível. Tentando play... (Tentativa ${attempts})`);
        video.play().catch(e => log(`[${localIdForLog}][VideoCheck ${peerId}] Erro ao tentar play (tentativa ${attempts}): ${e.message}`));
    }
  }, interval);
}

export function addStreamToVideoElement(stream, videoElement, peerId) {
  const localIdForLog = userId || 'local';
  if (!stream) {
    log(`[${localIdForLog}] Stream nulo fornecido para ${peerId || 'vídeo desconhecido'}`);
    return;
  }
  if (!videoElement) {
    log(`[${localIdForLog}] Elemento de vídeo nulo para ${peerId || 'stream desconhecido'}`);
    return;
  }

  log(`[${localIdForLog}] Adicionando stream a vídeo para ${peerId}. Tracks: ${stream.getTracks().map(t => t.kind).join(', ')}`);
  
  videoElement.srcObject = stream;
  videoElement.playsInline = true;
  videoElement.autoplay = true;

  if (peerId && peerId !== 'local') { // 'local' é um ID que você pode usar para o vídeo local
    videoElement.muted = true; 
    log(`[${localIdForLog}] Vídeo remoto ${peerId} mutado para autoplay.`);
  }

  videoElement.play().then(() => {
    log(`[${localIdForLog}] Playback iniciado para ${peerId || 'stream desconhecido'}`);
    ensureVideoIsVisible(videoElement, peerId || stream.id); // Usar stream.id se peerId não disponível
  }).catch(error => {
    log(`[${localIdForLog}] Erro ao reproduzir vídeo para ${peerId}: ${error.message} (${error.name})`);
    if (peerId && peerId !== 'local' && !videoElement.muted) {
        log(`[${localIdForLog}] Tentando novamente com muted para ${peerId}.`);
        videoElement.muted = true;
        videoElement.play().then(() => {
            log(`[${localIdForLog}] Playback com muted iniciado para ${peerId}`);
            ensureVideoIsVisible(videoElement, peerId || stream.id);
        }).catch(err2 => {
            log(`[${localIdForLog}] Erro ao reproduzir COM MUTED para ${peerId}: ${err2.message} (${err2.name})`);
        });
    } else if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
         log(`[${localIdForLog}] Playback para ${peerId} bloqueado/abortado. Interação do usuário pode ser necessária.`);
         ensureVideoIsVisible(videoElement, peerId || stream.id);
    }
  });
}

export function getDebugInfo() {
  const debugInfo = {
    connections: {},
    network: navigator.onLine,
    webRTCSupport: !!window.RTCPeerConnection,
    mediaDevices: !!navigator.mediaDevices,
    userId: userId,
    roomId: roomId
  };
  
  for (const peerId in peerConnections) {
    const pc = peerConnections[peerId];
    if (pc && typeof pc.signalingState !== 'undefined') { // Checar se é um PC real
        debugInfo.connections[peerId] = {
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
        iceGatheringState: pc.iceGatheringState,
        localDescription: !!pc.localDescription,
        remoteDescription: !!pc.remoteDescription,
        dataChannelReadyState: pc.dataChannel ? pc.dataChannel.readyState : 'N/A'
        };
    } else {
        debugInfo.connections[peerId] = { state: 'Placeholder ou inválido' };
    }
  }
  return debugInfo;
}

export function updateMediaStatus(audioEnabled, videoEnabled) {
  audioStatus = audioEnabled;
  videoStatus = videoEnabled;
  const localIdForLog = userId || 'local';
  
  for (const peerId in peerConnections) {
    const pc = peerConnections[peerId];
    if (pc && pc.dataChannel && pc.dataChannel.readyState === 'open') {
      pc.dataChannel.send(JSON.stringify({ type: 'media-status', audio: audioEnabled, video: videoEnabled }));
    } else {
      // log(`[${localIdForLog}] Canal de dados para ${peerId} não está aberto ou não existe para enviar media-status.`);
    }
  }
}

export function updateRemoteMediaUI(targetUserId, audioEnabled, videoEnabled) {
  const micStatus = document.querySelector(`#container-${targetUserId} .mic-status`);
  if (micStatus) {
    micStatus.innerHTML = audioEnabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    micStatus.classList.toggle('disabled', !audioEnabled);
  }
  
  const container = document.getElementById(`container-${targetUserId}`);
  if (container) {
    container.classList.toggle('video-off', !videoEnabled);
    const videoElement = container.querySelector('video');
    if (videoElement) { // Se o vídeo remoto for desligado, pausar o elemento
        if (!videoEnabled && !videoElement.paused) {
            videoElement.pause();
        } else if (videoEnabled && videoElement.paused) {
            // Não tentar play() automaticamente aqui, pois pode não haver stream ou pode falhar
            // A lógica de ensureVideoIsVisible ou um clique do usuário deve lidar com isso.
        }
    }
  }
}

// As funções handleNewUser e processSignals parecem ser de uma versão anterior ou lógica duplicada.
// A lógica de criação de conexão e processamento de sinais já está em connectToRoom, startPolling e handleSignal.
// Removendo-as para evitar confusão, a menos que sejam especificamente necessárias e ajustadas.

// No final do arquivo
export default {
  connectToRoom,
  addStreamToVideoElement,
  disconnect,
  getDebugInfo,
  updateMediaStatus,
  updateRemoteMediaUI
};