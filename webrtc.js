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
const SIGNALING_SERVER = 'https://webrtc.mosaicoworkers.workers.dev';

// Variáveis globais
let peerConnections = {}; // Armazena conexões peer
let localStream;
let roomId;
let userId;
let username;
let isPolling = false;
let lastPollTime = 0;

// Variável para armazenar status de áudio e vídeo
let audioStatus = true;
let videoStatus = true;

// Canal de dados para transmitir status do microfone/câmera entre participantes
let dataChannels = {};

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
      
      // Conectar com os usuários existentes - MODIFICAÇÃO AQUI
      // Ordene por ID para garantir que apenas um lado inicia
      const sortedUsers = [...data.users].sort((a, b) => a.id.localeCompare(b.id));
      
      sortedUsers.forEach(user => {
        if (user.id !== userId) {
          // Apenas o peer com ID "menor" alfabeticamente inicia a conexão
          const shouldInitiate = userId < user.id;
          console.log(`Detectado usuário: ${user.name} (${user.id}), iniciando: ${shouldInitiate}`);
          createPeerConnection(user.id, user.name, shouldInitiate, addRemoteVideo);
        }
      });
      
      // Começar a consultar o servidor em busca de atualizações
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
  lastPollTime = Date.now() - 30000; // Pegue os últimos 30 segundos de sinais para garantir
  
  async function poll() {
    if (!isPolling) return;
    
    try {
      const response = await fetch(`${SIGNALING_SERVER}/poll?room=${roomId}&id=${userId}&last=${lastPollTime}`);
      const data = await response.json();
      
      if (data.success) {
        console.log(`Poll: ${data.users.length} usuários, ${data.signals?.length || 0} sinais`);
        console.log("Usuários na sala:", data.users);
        
        // Processar novos usuários
        data.users.forEach(user => {
          if (user.id !== userId && !peerConnections[user.id]) {
            console.log(`Novo usuário: ${user.name} (${user.id})`);
            createPeerConnection(user.id, user.name, true, addRemoteVideo);
          }
        });
        
        // Processar sinais recebidos
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
    
    // Sempre agendar próximo poll, mesmo com erro
    setTimeout(poll, 2000);
  }
  
  // Iniciar o polling
  poll();
}

// Processa sinais recebidos
async function handleSignal(signal, addRemoteVideo) {
  const { type, sender, data: signalData } = signal;
  
  console.log(`Processando sinal ${type} de ${sender}`);
  
  if (!peerConnections[sender]) {
    console.log(`Criando nova conexão para ${sender} após receber sinal`);
    // Importante: se receber uma oferta, NÃO devemos iniciar nossa própria oferta
    const initiator = type !== 'offer';
    createPeerConnection(sender, null, initiator, addRemoteVideo);
  }
  
  const pc = peerConnections[sender];
  
  try {
    if (type === 'offer') {
      console.log(`Recebeu oferta, configurando conexão remota`);
      
      // Se já tiver uma oferta pendente, verificamos quem tem prioridade
      if (pc.signalingState === 'have-local-offer') {
        // Regra de desempate: ID menor alfabeticamente vence
        if (userId < sender) {
          console.log("Colisão de ofertas, ignorando a oferta remota (temos prioridade)");
          return; // Ignoramos a oferta recebida
        } else {
          console.log("Colisão de ofertas, rolando de volta nossa oferta");
          await pc.setLocalDescription({type: "rollback"});
        }
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(signalData));
      
      console.log("Criando resposta");
      const answer = await pc.createAnswer();
      console.log(`Resposta criada, definindo descrição local`);
      await pc.setLocalDescription(answer);
      
      console.log(`Enviando resposta para ${sender}`);
      sendSignal(sender, 'answer', answer);
    } else if (type === 'answer') {
      console.log(`Recebeu resposta, definindo descrição remota`);
      await pc.setRemoteDescription(new RTCSessionDescription(signalData));
    } else if (type === 'candidate') {
      console.log(`Recebeu candidato ICE`);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signalData));
      } catch (e) {
        if (pc.remoteDescription) {
          console.error(`Erro ao adicionar candidato ICE: ${e.message}`);
        } else {
          console.log("Armazenando candidato ICE para mais tarde");
          if (!pc.pendingCandidates) pc.pendingCandidates = [];
          pc.pendingCandidates.push(signalData);
        }
      }
    }
  } catch (error) {
    console.error(`Erro ao processar sinal ${type}: ${error.message}`);
  }
}

// Envia um sinal para outro peer
async function sendSignal(target, type, data) {
  try {
    log(`Enviando sinal ${type} para ${target}`);
    const response = await fetch(`${SIGNALING_SERVER}/signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: userId,
        target,
        type,
        data
      })
    });
    
    const result = await response.json();
    if (result.success) {
      log(`Sinal ${type} enviado com sucesso para ${target}`);
    } else {
      log(`Falha ao enviar sinal ${type} para ${target}`);
    }
  } catch (error) {
    log(`Erro ao enviar sinal ${type} para ${target}: ${error.message}`);
  }
}

// Melhorar a função createPeerConnection para lidar melhor com falhas de ICE
function createPeerConnection(peerId, peerName, initiator, addRemoteVideo) {
  console.log(`Criando conexão com peer ${peerId}${initiator ? ' (como iniciador)' : ''}`);
  
  // Usar configuração otimizada para melhorar a taxa de sucesso da conexão
  const pc = new RTCPeerConnection({
    ...configuration,
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  });
  
  peerConnections[peerId] = pc;
  
  // Adicionar tracks locais à conexão
  if (localStream) {
    console.log(`Adicionando ${localStream.getTracks().length} tracks locais à conexão`);
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  // Lidar com candidatos ICE
  pc.onicecandidate = event => {
    if (event.candidate) {
      console.log(`Enviando candidato ICE para ${peerId}: ${event.candidate.candidate.substr(0, 50)}...`);
      sendSignal(peerId, 'candidate', event.candidate);
    } else {
      console.log(`Coleta de candidatos ICE para ${peerId} concluída`);
    }
  };
  
  // Monitorar o estado da conexão com melhor tratamento de falhas
  pc.oniceconnectionstatechange = () => {
    console.log(`Estado ICE para ${peerId}: ${pc.iceConnectionState}`);
    
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log(`Conexão estabelecida com ${peerId}!`);
      // Limpar temporizadores de retry se existirem
      if (pc.iceRetryTimer) {
        clearTimeout(pc.iceRetryTimer);
        pc.iceRetryTimer = null;
      }
    }
    
    // Retry de conexão se falhar com backoff exponencial
    if (pc.iceConnectionState === 'failed') {
      console.log(`Conexão com ${peerId} falhou, tentando reiniciar ICE`);
      
      // Número de tentativas para este peer
      pc.iceRetryCount = (pc.iceRetryCount || 0) + 1;
      
      if (pc.iceRetryCount <= 5) { // Máximo de 5 tentativas
        // Backoff exponencial: 2s, 4s, 8s, 16s, 32s
        const delay = Math.pow(2, pc.iceRetryCount) * 1000;
        console.log(`Tentativa ${pc.iceRetryCount} para ${peerId}, aguardando ${delay/1000}s`);
        
        pc.iceRetryTimer = setTimeout(() => {
          pc.restartIce();
          
          // Se for iniciador, tenta novamente a oferta
          if (initiator) {
            console.log(`Tentando nova oferta para ${peerId} após falha`);
            createAndSendOffer(pc, peerId);
          }
        }, delay);
      } else {
        console.warn(`Desistindo de conectar com ${peerId} após 5 tentativas`);
      }
    }
    
    // Limpar recursos se desconectado completamente
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
      if (pc.iceRetryTimer) {
        clearTimeout(pc.iceRetryTimer);
        pc.iceRetryTimer = null;
      }
      
      // Não fechar a conexão imediatamente em disconnected, aguardar 5s
      if (pc.iceConnectionState === 'disconnected' && !pc.disconnectTimer) {
        pc.disconnectTimer = setTimeout(() => {
          console.log(`Desconexão persistente de ${peerId}, fechando conexão`);
          if (peerConnections[peerId]) {
            pc.close();
            delete peerConnections[peerId];
          }
          
          // Não remover o elemento de vídeo automaticamente
          // Deixar para a UI decidir o que fazer, apenas disparar evento
          const event = new CustomEvent('peer-disconnected', {
            detail: { peerId: peerId }
          });
          window.dispatchEvent(event);
          
        }, 5000);
      }
    }
    
    // Se reconectar, cancelar timer de desconexão
    if (pc.disconnectTimer && 
        (pc.iceConnectionState === 'connected' || 
         pc.iceConnectionState === 'completed')) {
      clearTimeout(pc.disconnectTimer);
      pc.disconnectTimer = null;
      console.log(`Reconectado com ${peerId}`);
    }
  };
  
  // Adicionar canal de dados para comunicação não-mídia
  if (initiator) {
    const dataChannel = pc.createDataChannel('status');
    setupDataChannel(dataChannel, peerId);
    pc.dataChannel = dataChannel;
  } else {
    pc.ondatachannel = (event) => {
      const dataChannel = event.channel;
      setupDataChannel(dataChannel, peerId);
      pc.dataChannel = dataChannel;
    };
  }
  
  // Configurar o canal de dados de forma consistente
  function setupDataChannel(dataChannel, peerId) {
    dataChannel.onopen = () => {
      console.log(`Canal de dados aberto para ${peerId}`);
      // Enviar status atual imediatamente após conexão
      dataChannel.send(JSON.stringify({
        type: 'media-status',
        audio: audioStatus,
        video: videoStatus
      }));
    };
    
    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'media-status') {
          // Atualizar UI com status remoto
          updateRemoteMediaUI(peerId, data.audio, data.video);
          
          // Disparar evento para notificar a interface sobre mudança de status
          const statusEvent = new CustomEvent('remote-media-status', {
            detail: {
              peerId: peerId,
              audio: data.audio,
              video: data.video
            }
          });
          window.dispatchEvent(statusEvent);
        }
      } catch (e) {
        console.error('Erro ao processar mensagem de dados:', e);
      }
    };
    
    dataChannel.onerror = (error) => {
      console.error(`Erro no canal de dados para ${peerId}:`, error);
    };
    
    dataChannel.onclose = () => {
      console.log(`Canal de dados fechado para ${peerId}`);
    };
  }
  
  // Lidar com estado da negociação
  pc.onnegotiationneeded = () => {
    log(`Negociação necessária para ${peerId}`);
    if (initiator) {
      log(`Iniciando negociação com ${peerId}`);
      createAndSendOffer(pc, peerId);
    }
  };
  
  // Lidar com estado da conexão
  pc.onconnectionstatechange = () => {
    log(`Estado da conexão com ${peerId}: ${pc.connectionState}`);
    
    // Disparar evento de estado da conexão
    const event = new CustomEvent('peer-connection-state', {
      detail: { 
        peerId: peerId,
        state: pc.connectionState
      }
    });
    window.dispatchEvent(event);
  };
  
  // Melhorar tratamento de streams remotos
  pc.ontrack = event => {
    console.log(`[WebRTC ${new Date().toLocaleTimeString()}] Recebeu track de ${peerId}: ${event.track.kind}`);
    
    // Verificar se já temos o stream para este peer
    const existingStream = pc.remoteStreams ? pc.remoteStreams[event.streams[0]?.id] : null;
    
    if (existingStream) {
      console.log(`Stream já registrado para ${peerId}, atualizando`);
      return;
    }
    
    if (!event.streams || !event.streams[0]) {
      console.log(`[WebRTC ${new Date().toLocaleTimeString()}] Recebeu track sem stream associado, criando stream manualmente`);
      // Criar um novo stream se não houver um associado à track
      const syntheticStream = new MediaStream([event.track]);
      
      // Armazenar referência ao stream
      if (!pc.remoteStreams) pc.remoteStreams = {};
      pc.remoteStreams[event.track.id] = syntheticStream;
      
      // Chamar a função de callback para adicionar vídeo com o stream sintético
      if (addRemoteVideo && typeof addRemoteVideo === 'function') {
        addRemoteVideo(syntheticStream, peerId, peerName);
      }
      return;
    }
    
    const remoteStream = event.streams[0];
    console.log(`[WebRTC ${new Date().toLocaleTimeString()}] Processando stream remoto de ${peerId}`);
    
    // Armazenar referência ao stream
    if (!pc.remoteStreams) pc.remoteStreams = {};
    pc.remoteStreams[remoteStream.id] = remoteStream;
    
    // Chamar a função de callback para adicionar vídeo
    if (addRemoteVideo && typeof addRemoteVideo === 'function') {
      addRemoteVideo(remoteStream, peerId, peerName);
    }
    
    // Monitorar quando tracks são removidas
    event.track.onended = () => {
      console.log(`Track ${event.track.kind} terminada de ${peerId}`);
    };
  };
  
  // Se for o iniciador, criar e enviar oferta (com pequeno atraso)
  if (initiator) {
    setTimeout(() => {
      log(`Iniciando oferta para ${peerId} após atraso`);
      createAndSendOffer(pc, peerId);
    }, 1000); // Pequeno atraso para garantir que tudo esteja configurado
  }
  
  return pc;
}

// Cria e envia uma oferta para outro peer
async function createAndSendOffer(pc, peerId) {
  try {
    log(`Criando oferta para ${peerId}`);
    const offer = await pc.createOffer();
    log(`Definindo descrição local para ${peerId}`);
    await pc.setLocalDescription(offer);
    
    log(`Enviando oferta para ${peerId}`);
    sendSignal(peerId, 'offer', offer);
  } catch (error) {
    log(`Erro ao criar/enviar oferta para ${peerId}: ${error.message}`);
  }
}

// Parar conexões e limpar recursos
export function disconnect() {
  log("Desconectando de todas as chamadas");
  isPolling = false;
  
  // Fechar todas as conexões peer
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  
  // Parar todas as tracks do stream local
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  log("Desconectado");
}

// Substituir a função ensureVideoIsVisible por uma versão melhorada
function ensureVideoIsVisible(videoElement, peerId, maxAttempts = 20) {
  let attempts = 0;
  const checkInterval = setInterval(() => {
    if (attempts > maxAttempts) {
      console.warn(`Desistindo de verificar vídeo para ${peerId} após ${maxAttempts} tentativas`);
      clearInterval(checkInterval);
      return;
    }
    attempts++;
    
    if (videoElement.paused || videoElement.videoWidth === 0 || videoElement.readyState < 3) {
      console.log(`Tentativa ${attempts}/${maxAttempts} de reproduzir vídeo do peer ${peerId}`);
      videoElement.play().catch(e => {
        console.log(`Erro ao forçar play (tentativa ${attempts}):`, e);
        
        // Na tentativa 5, tentar forçar com mute se ainda não estiver mudo
        if (attempts === 5 && !videoElement.muted && peerId !== 'local') {
          console.log(`Tentando com muted para ${peerId}`);
          videoElement.muted = true;
        }
        
        // Na tentativa 10, tentar recarregar o stream
        if (attempts === 10) {
          console.log(`Tentando recarregar stream para ${peerId}`);
          const stream = videoElement.srcObject;
          videoElement.srcObject = null;
          setTimeout(() => {
            videoElement.srcObject = stream;
            videoElement.play().catch(() => {});
          }, 500);
        }
      });
    } else if (videoElement.readyState >= 3 && !videoElement.paused) {
      console.log(`Vídeo do peer ${peerId} está reproduzindo corretamente!`);
      clearInterval(checkInterval);
      
      // Disparar um evento para notificar que o vídeo está ativo
      const event = new CustomEvent('video-active', { 
        detail: { peerId: peerId } 
      });
      window.dispatchEvent(event);
      
      // Se foi necessário mutar temporariamente, restaurar áudio após alguns segundos
      if (videoElement.muted && peerId !== 'local') {
        setTimeout(() => {
          videoElement.muted = false;
          console.log(`Áudio restaurado para ${peerId}`);
        }, 3000); // Dar um tempo para que o usuário tenha interagido com a página
      }
    }
  }, 1000);
}

// Melhorar a função addStreamToVideoElement para garantir que os vídeos sejam carregados corretamente
export function addStreamToVideoElement(stream, videoElement, peerId) {
  log("Adicionando stream a elemento de vídeo para " + peerId);
  
  // Certificar-se de que o stream não é nulo
  if (!stream) {
    console.error(`Stream inválido para ${peerId}`);
    return;
  }
  
  // Certificar-se de que o elemento de vídeo existe
  if (!videoElement) {
    console.error(`Elemento de vídeo não encontrado para ${peerId}`);
    return;
  }
  
  videoElement.srcObject = stream;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.muted = peerId === 'local'; // Mutar apenas o vídeo local
  
  // Forçar play com tratamento de erro aprimorado
  const playPromise = videoElement.play();
  
  if (playPromise !== undefined) {
    playPromise.catch(error => {
      console.warn('Erro ao reproduzir vídeo automaticamente:', error);
      
      // Se o erro for devido a restrições de autoplay, tentar novamente com muted
      if (error.name === 'NotAllowedError' && peerId !== 'local') {
        console.log(`Tentando autoplay com muted para ${peerId}`);
        videoElement.muted = true;
        
        videoElement.play().catch(e => {
          console.error(`Falha mesmo com muted para ${peerId}:`, e);
          
          // Mostrar botão de play se autoplay falhar
          const container = videoElement.parentElement;
          if (container && !container.querySelector('.video-play-button')) {
            const playButton = document.createElement('button');
            playButton.className = 'video-play-button';
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.onclick = () => {
              videoElement.play()
                .then(() => {
                  playButton.remove();
                  // Restaurar áudio depois que o usuário interagir
                  if (peerId !== 'local') {
                    setTimeout(() => { videoElement.muted = false; }, 1000);
                  }
                })
                .catch(e => console.log('Erro ao forçar play:', e));
            };
            container.appendChild(playButton);
          }
        });
      }
    });
  }
  
  // Registrar múltiplos eventos para garantir reprodução
  videoElement.addEventListener('loadedmetadata', () => {
    log(`Metadata de vídeo carregada para ${peerId}`);
    videoElement.play().catch(e => console.log(`Erro no loadedmetadata para ${peerId}:`, e));
  });
  
  videoElement.addEventListener('loadeddata', () => {
    log(`Dados de vídeo carregados para ${peerId}`);
    videoElement.play().catch(e => console.log(`Erro no loadeddata para ${peerId}:`, e));
  });
  
  videoElement.addEventListener('canplay', () => {
    log(`Vídeo pode ser reproduzido para ${peerId}`);
    videoElement.play().catch(e => console.log(`Erro no canplay para ${peerId}:`, e));
  });
  
  // Verificar periodicamente o estado do vídeo com tempo máximo maior
  ensureVideoIsVisible(videoElement, peerId, 30); // 30 tentativas (30 segundos)
}

// Adicione esta função de exportação para debug
export function getDebugInfo() {
  const debugInfo = {
    connections: {},
    network: navigator.onLine,
    webRTCSupport: !!window.RTCPeerConnection,
    mediaDevices: !!navigator.mediaDevices
  };
  
  // Obtenha estado das conexões
  for (const peerId in peerConnections) {
    const pc = peerConnections[peerId];
    debugInfo.connections[peerId] = {
      iceConnectionState: pc.iceConnectionState,
      connectionState: pc.connectionState,
      signalingState: pc.signalingState,
      iceCandidates: pc.remoteDescription ? 'Sim' : 'Não'
    };
  }
  
  return debugInfo;
}

// Função para enviar estado de mídia para outros participantes
export function updateMediaStatus(audioEnabled, videoEnabled) {
  audioStatus = audioEnabled;
  videoStatus = videoEnabled;
  
  // Enviar status para todos os peers conectados
  for (const peerId in peerConnections) {
    if (peerConnections[peerId].dataChannel && 
        peerConnections[peerId].dataChannel.readyState === 'open') {
      peerConnections[peerId].dataChannel.send(JSON.stringify({
        type: 'media-status',
        audio: audioEnabled,
        video: videoEnabled
      }));
    }
  }
}

// Função para atualizar UI baseada no status remoto
export function updateRemoteMediaUI(userId, audioEnabled, videoEnabled) {
  // Atualizar ícone de microfone
  const micStatus = document.querySelector(`#container-${userId} .mic-status`);
  if (micStatus) {
    micStatus.innerHTML = audioEnabled ? 
      '<i class="fas fa-microphone"></i>' : 
      '<i class="fas fa-microphone-slash"></i>';
    micStatus.classList.toggle('disabled', !audioEnabled);
  }
  
  // Marcar container de vídeo como desligado se necessário
  const container = document.getElementById(`container-${userId}`);
  if (container) {
    container.classList.toggle('video-off', !videoEnabled);
  }
}

// Modificar o handler de novos usuários para criar conexões
function handleNewUser(user) {
  if (user.id === myId) return; // Não conectar a si mesmo
  
  console.log(`Novo usuário detectado: ${user.name} (${user.id})`);
  
  // Iniciar conexão como initiator
  createPeerConnection(user.id, user.name, true);
  
  // Criar e enviar oferta
  const pc = peerConnections[user.id];
  if (pc) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        sendSignal(user.id, {
          type: 'offer',
          sdp: pc.localDescription
        });
        console.log(`Oferta enviada para ${user.name}`);
      })
      .catch(err => console.error('Erro ao criar oferta:', err));
  }
}

// Garantir que o processamento de sinais esteja correto
// Adicionar um conjunto para rastrear sinais já processados
const processedSignals = new Set();

function processSignals(signals) {
  signals.forEach(signal => {
    const { from, data, id } = signal;
    
    // Verificar se este sinal já foi processado (usando ID único)
    const signalId = id || `${from}-${data.type}-${Date.now()}`;
    if (processedSignals.has(signalId)) {
      console.log(`Sinal duplicado ignorado: ${data.type} de ${from}`);
      return;
    }
    
    // Marcar sinal como processado
    processedSignals.add(signalId);
    
    // Limitar tamanho do conjunto para evitar crescimento infinito
    if (processedSignals.size > 1000) {
      const iterator = processedSignals.values();
      processedSignals.delete(iterator.next().value);
    }
    
    console.log(`Processando sinal ${data.type} de ${from}`);
    
    // Resto do código de processamento existente...
    // ...
    
    // Para sinais 'answer', verificar o estado atual antes de aplicar
    if (data.type === 'answer') {
      const pc = peerConnections[from];
      if (pc && pc.signalingState === 'have-local-offer') {
        // Só aplicar resposta se estivermos no estado correto
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          .catch(err => console.error('Erro ao processar resposta:', err));
      } else {
        console.log(`Ignorando resposta de ${from}, estado atual: ${pc ? pc.signalingState : 'conexão não encontrada'}`);
      }
    }
    
    // ...resto do código existente...
  });
}

// No final do arquivo
export default {
  connectToRoom,
  addStreamToVideoElement,
  disconnect,
  getDebugInfo,
  updateMediaStatus,
  updateRemoteMediaUI
};