// Utilitário para corrigir problemas de conexão WebRTC
// Este script ajuda a solucionar problemas comuns nas conexões peer-to-peer

// Diagnóstico detalhado das conexões WebRTC
function diagnoseConnections(peerConnections) {
  console.log('==========================================');
  console.log('DIAGNÓSTICO DE CONEXÕES WEBRTC');
  console.log('==========================================');
  console.log(`Total de conexões: ${Object.keys(peerConnections).length}`);
  
  const problemsByType = {
    noRemoteDescription: [],
    noLocalDescription: [],
    failedIce: [],
    disconnectedIce: [],
    noRemoteStream: [],
    stable: []
  };
  
  // Analisar cada conexão
  for (const [peerId, pc] of Object.entries(peerConnections)) {
    if (!pc || !pc.signalingState) {
      console.log(`[${peerId}] Conexão inválida ou placeholder`);
      continue;
    }
    
    console.log(`\n[${peerId}] Estado atual:`);
    console.log(`  - Signaling: ${pc.signalingState}`);
    console.log(`  - ICE Connection: ${pc.iceConnectionState}`);
    console.log(`  - ICE Gathering: ${pc.iceGatheringState}`);
    console.log(`  - Connection: ${pc.connectionState}`);
    console.log(`  - Local Description: ${pc.localDescription ? pc.localDescription.type : 'Não definida'}`);
    console.log(`  - Remote Description: ${pc.remoteDescription ? pc.remoteDescription.type : 'Não definida'}`);
    
    const remoteStreams = pc.getRemoteStreams();
    console.log(`  - Streams remotos: ${remoteStreams.length}`);
    
    if (!pc.remoteDescription) {
      problemsByType.noRemoteDescription.push(peerId);
    } else if (!pc.localDescription) {
      problemsByType.noLocalDescription.push(peerId);
    } else if (pc.iceConnectionState === 'failed') {
      problemsByType.failedIce.push(peerId);
    } else if (pc.iceConnectionState === 'disconnected') {
      problemsByType.disconnectedIce.push(peerId);
    } else if (remoteStreams.length === 0) {
      problemsByType.noRemoteStream.push(peerId);
    } else if (pc.signalingState === 'stable' && pc.iceConnectionState === 'connected') {
      problemsByType.stable.push(peerId);
    }
  }
  
  // Resumo de problemas
  console.log('\n==========================================');
  console.log('RESUMO DE PROBLEMAS:');
  console.log(`- Sem descrição remota: ${problemsByType.noRemoteDescription.length}`);
  console.log(`- Sem descrição local: ${problemsByType.noLocalDescription.length}`);
  console.log(`- ICE falhou: ${problemsByType.failedIce.length}`);
  console.log(`- ICE desconectado: ${problemsByType.disconnectedIce.length}`);
  console.log(`- Sem stream remoto: ${problemsByType.noRemoteStream.length}`);
  console.log(`- Conexões estáveis: ${problemsByType.stable.length}`);
  console.log('==========================================');
  
  return problemsByType;
}

// Reparar conexões com problemas
async function repairConnections(peerConnections, userId) {
  const problems = diagnoseConnections(peerConnections);
  const repairPromises = [];
  const localIdForLog = userId || 'local';
  
  console.log(`[${localIdForLog}] Iniciando reparo de conexões com problemas...`);
  
  // Reparar conexões sem descrição remota
  for (const peerId of problems.noRemoteDescription) {
    console.log(`[${localIdForLog}] Tentando reparar conexão sem descrição remota para ${peerId}`);
    const pc = peerConnections[peerId];
    
    // Verificar se é o iniciador baseado no userId
    const shouldInitiate = userId < peerId;
    if (shouldInitiate) {
      console.log(`[${localIdForLog}] Como iniciador, enviando nova oferta para ${peerId}`);
      repairPromises.push(createAndSendOfferSafe(pc, peerId));
    } else {
      console.log(`[${localIdForLog}] Como não-iniciador para ${peerId}, aguardando oferta`);
    }
  }
  
  // Reparar conexões com ICE falho
  for (const peerId of [...problems.failedIce, ...problems.disconnectedIce]) {
    console.log(`[${localIdForLog}] Reparando ICE para ${peerId}`);
    const pc = peerConnections[peerId];
    
    if (pc.signalingState === 'stable') {
      console.log(`[${localIdForLog}] Reiniciando ICE para ${peerId}`);
      pc.restartIce();
      
      const shouldInitiate = userId < peerId;
      if (shouldInitiate) {
        console.log(`[${localIdForLog}] Criando oferta com ICE restart para ${peerId}`);
        repairPromises.push(createAndSendOfferSafe(pc, peerId, true));
      }
    } else {
      console.log(`[${localIdForLog}] Não pode reiniciar ICE para ${peerId}, estado não é stable: ${pc.signalingState}`);
    }
  }
  
  // Esperar reparos completarem
  if (repairPromises.length > 0) {
    console.log(`[${localIdForLog}] Aguardando ${repairPromises.length} operações de reparo...`);
    await Promise.allSettled(repairPromises);
    console.log(`[${localIdForLog}] Reparos concluídos`);
  }
  
  return diagnoseConnections(peerConnections);
}

// Função segura para criar e enviar oferta
async function createAndSendOfferSafe(pc, peerId, iceRestart = false) {
  if (!pc || pc.signalingState === 'closed') {
    console.log(`Conexão fechada para ${peerId}, não enviando oferta`);
    return;
  }
  
  try {
    console.log(`Criando oferta para ${peerId} (ICE restart: ${iceRestart})`);
    const offer = await pc.createOffer({ iceRestart });
    
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
      console.log(`Estado mudou para ${pc.signalingState} para ${peerId}, abortando setLocalDescription`);
      return;
    }
    
    await pc.setLocalDescription(offer);
    console.log(`LocalDescription definida para ${peerId}, enviando oferta`);
    
    // Esta é uma chamada para uma função externa que deve estar definida no contexto
    // onde este utilitário é importado
    if (typeof sendSignal === 'function') {
      sendSignal(peerId, 'offer', pc.localDescription);
    } else {
      console.error("Função sendSignal não está definida no escopo atual");
    }
  } catch (error) {
    console.error(`Erro ao criar/enviar oferta para ${peerId}:`, error);
  }
}

// Verificar se há tracks de vídeo na conexão
function verifyVideoTracks(peerConnections) {
  console.log('==========================================');
  console.log('VERIFICAÇÃO DE TRACKS DE VÍDEO');
  console.log('==========================================');
  
  for (const [peerId, pc] of Object.entries(peerConnections)) {
    if (!pc || !pc.signalingState || pc.signalingState === 'closed') continue;
    
    const senders = pc.getSenders();
    const receivers = pc.getReceivers();
    
    console.log(`\n[${peerId}]:`);
    console.log(`- Enviando: ${senders.length} tracks`);
    console.log(`- Recebendo: ${receivers.length} tracks`);
    
    const videoSenders = senders.filter(s => s.track && s.track.kind === 'video');
    const videoReceivers = receivers.filter(r => r.track && r.track.kind === 'video');
    
    console.log(`- Enviando vídeo: ${videoSenders.length} tracks (enabled: ${videoSenders.filter(s => s.track.enabled).length})`);
    console.log(`- Recebendo vídeo: ${videoReceivers.length} tracks (enabled: ${videoReceivers.filter(r => r.track.enabled).length})`);
    
    if (videoReceivers.length > 0) {
      videoReceivers.forEach((receiver, idx) => {
        console.log(`  - Track de vídeo #${idx}: readyState=${receiver.track.readyState}, enabled=${receiver.track.enabled}, muted=${receiver.track.muted}`);
      });
    }
  }
}

export { diagnoseConnections, repairConnections, verifyVideoTracks };
