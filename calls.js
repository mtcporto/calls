import { connectToRoom, addStreamToVideoElement, disconnect, getDebugInfo } from './webrtc.js';

// Variáveis
let localStream;
let audioEnabled = true;
let videoEnabled = true;
const userName = localStorage.getItem('userName') || 'Anônimo';
let activeSpeakerId = null;
let localVideoContainer = null;

// Elementos DOM
const toggleAudioButton = document.getElementById('toggle-audio');
const toggleVideoButton = document.getElementById('toggle-video');
const leaveButton = document.getElementById('leave-button');
const cameraSelect = document.getElementById('camera-select');
const microphoneSelect = document.getElementById('microphone-select');
const speakerSelect = document.getElementById('speaker-select');
const mainVideoContainer = document.getElementById('main-video-container');
const pipContainer = document.getElementById('pip-container');
const audioSettingsButton = document.getElementById('audio-settings');
const videoSettingsButton = document.getElementById('video-settings');
const audioSettingsMenu = document.getElementById('audio-settings-menu');
const videoSettingsMenu = document.getElementById('video-settings-menu');
const shareButton = document.getElementById('share-button');
const shareDialog = document.getElementById('share-dialog');
const meetingLinkInput = document.getElementById('meeting-link');
const copyLinkButton = document.getElementById('copy-link');
const closeShareButton = document.getElementById('close-share');
const roomCodeElement = document.getElementById('room-code');

// Obter código da sala a partir da URL
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');

// Verificar se temos um código de sala
if (!roomCode) {
  alert('Código de sala inválido. Redirecionando para a página inicial.');
  window.location.href = 'index.html';
}

// Atualizar UI com informações da sala
roomCodeElement.textContent = formatRoomCode(roomCode);
document.title = `Meet: ${formatRoomCode(roomCode)}`;
meetingLinkInput.value = `${window.location.origin}/calls/calls.html?room=${roomCode}`;

// Atualizar relógio
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('current-time').textContent = timeStr;
}
updateClock();
setInterval(updateClock, 60000);

// Inicializar
async function init() {
  try {
    // Inicializar o stream local
    const stream = await startLocalStream();
    
    // Criar container para vídeo local
    localVideoContainer = createVideoContainer('local', userName + ' (Você)', stream);
    localVideoContainer.classList.add('local-video');
    
    // Adicionar ao container principal primeiro
    mainVideoContainer.appendChild(localVideoContainer);
    
    // Conectar à sala WebRTC
    const connected = await connectToRoom(roomCode, stream, handleRemoteStream);
    
    if (!connected) {
      alert('Erro ao conectar à sala. Por favor, tente novamente.');
    }
    
    // Atualizar lista de dispositivos
    await updateDeviceList();
    
    // Detectar áudio do usuário local para active speaker
    detectAudioActivity(stream, 'local');
  } catch (error) {
    console.error('Erro ao inicializar:', error);
    alert(`Erro ao acessar câmera/microfone: ${error.message}`);
  }
}

// Criar container de vídeo
function createVideoContainer(id, name, stream) {
  const container = document.createElement('div');
  container.className = 'video-container';
  container.id = `container-${id}`;
  container.dataset.participantId = id;
  
  const video = document.createElement('video');
  video.id = `video-${id}`;
  video.autoplay = true;
  video.playsInline = true;
  if (id === 'local') video.muted = true;
  
  const nameTag = document.createElement('div');
  nameTag.className = 'participant-name';
  nameTag.textContent = name;
  
  // Adicionar indicadores de status (microfone/câmera)
  const statusIcons = document.createElement('div');
  statusIcons.className = 'status-icons';
  
  const micIcon = document.createElement('span');
  micIcon.className = 'status-icon mic-status';
  micIcon.innerHTML = '<i class="fas fa-microphone"></i>';
  
  statusIcons.appendChild(micIcon);
  
  // Adicionar todos os elementos ao container
  container.appendChild(video);
  container.appendChild(nameTag);
  container.appendChild(statusIcons);
  
  // Anexar o stream ao vídeo
  if (stream) {
    video.srcObject = stream;
  }
  
  // Adicionar evento de clique para alternar entre principal e PIP
  container.addEventListener('click', function() {
    toggleMainVideo(id);
  });
  
  return container;
}

// Alternar vídeo principal
function toggleMainVideo(id) {
  const container = document.getElementById(`container-${id}`);
  
  // Se este container já está no main, não fazer nada
  if (container.parentElement === mainVideoContainer) return;
  
  // Recuperar o container que está no main atualmente
  const mainVideo = mainVideoContainer.querySelector('.video-container');
  
  if (mainVideo) {
    // Mover o vídeo principal atual para o PIP
    mainVideoContainer.removeChild(mainVideo);
    pipContainer.appendChild(mainVideo);
    mainVideo.classList.remove('main-video');
    mainVideo.classList.add('pip-video');
  }
  
  // Mover o container clicado para o main
  pipContainer.removeChild(container);
  mainVideoContainer.appendChild(container);
  container.classList.remove('pip-video');
  container.classList.add('main-video');
  
  activeSpeakerId = id;
}

// Lidar com stream remoto
function handleRemoteStream(stream, userId, userName) {
  // Verificar se o container já existe
  const existingContainer = document.getElementById(`container-${userId}`);
  if (existingContainer) {
    const video = document.getElementById(`video-${userId}`);
    video.srcObject = stream;
    return;
  }
  
  // Criar novo container de vídeo
  const container = createVideoContainer(userId, userName, stream);
  
  // Colocar no PIP se temos um vídeo principal
  // Ou como principal se não há vídeo principal ainda
  if (mainVideoContainer.querySelector('.video-container')) {
    container.classList.add('pip-video');
    pipContainer.appendChild(container);
  } else {
    container.classList.add('main-video');
    mainVideoContainer.appendChild(container);
    activeSpeakerId = userId;
  }
  
  // Configurar detecção de áudio para este stream
  detectAudioActivity(stream, userId);
}

// Função para iniciar stream local
async function startLocalStream(videoDeviceId, audioDeviceId) {
  const constraints = {
    audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
    video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true
  };
  
  // Se já existe um stream, pare-o
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  // Obter novo stream
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  
  // Se já temos um container de vídeo, atualizar o stream
  const localVideo = document.getElementById('video-local');
  if (localVideo) {
    localVideo.srcObject = localStream;
  }
  
  return localStream;
}

// Adicionar lógica para detecção e priorização de headsets

async function updateDeviceList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Limpar seletores
    cameraSelect.innerHTML = '';
    microphoneSelect.innerHTML = '';
    speakerSelect.innerHTML = '';
    
    // Arrays para armazenar dispositivos
    const cameras = devices.filter(d => d.kind === 'videoinput');
    const microphones = devices.filter(d => d.kind === 'audioinput');
    const speakers = devices.filter(d => d.kind === 'audiooutput');
    
    // Mapear dispositivos por groupId para detectar headsets
    const deviceGroups = {};
    
    // Agrupar dispositivos pelo groupId (mesmo dispositivo físico)
    for (const device of [...microphones, ...speakers]) {
      if (!deviceGroups[device.groupId]) {
        deviceGroups[device.groupId] = {
          groupId: device.groupId,
          label: device.label,
          microphone: null,
          speaker: null,
          count: 0
        };
      }
      
      if (device.kind === 'audioinput') {
        deviceGroups[device.groupId].microphone = device;
      } else if (device.kind === 'audiooutput') {
        deviceGroups[device.groupId].speaker = device;
      }
      
      deviceGroups[device.groupId].count++;
    }
    
    // Encontrar headset (dispositivo com entrada e saída de áudio)
    let headset = null;
    for (const groupId in deviceGroups) {
      if (deviceGroups[groupId].microphone && deviceGroups[groupId].speaker) {
        headset = deviceGroups[groupId];
        break;
      }
    }
    
    // Adicionar câmeras
    cameras.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Câmera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
    
    // Adicionar microfones (priorizar o do headset se existir)
    let headsetMicSelected = false;
    microphones.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Microfone ${index + 1}`;
      
      // Selecionar automaticamente o microfone do headset
      if (headset && headset.microphone && device.deviceId === headset.microphone.deviceId) {
        option.selected = true;
        headsetMicSelected = true;
      }
      
      microphoneSelect.appendChild(option);
    });
    
    // Adicionar alto-falantes (priorizar o do headset se existir)
    if (speakers.length > 0) {
      let headsetSpeakerSelected = false;
      speakers.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Alto-falante ${index + 1}`;
        
        // Selecionar automaticamente o alto-falante do headset
        if (headset && headset.speaker && device.deviceId === headset.speaker.deviceId) {
          option.selected = true;
          headsetSpeakerSelected = true;
        }
        
        speakerSelect.appendChild(option);
      });
      
      // Se temos um headset mas ele não foi selecionado (caso raro)
      if (headset && headset.speaker && !headsetSpeakerSelected) {
        speakerSelect.value = headset.speaker.deviceId;
      }
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.text = 'Alto-falante padrão';
      speakerSelect.appendChild(option);
      speakerSelect.disabled = true;
    }
    
    // Se temos um headset selecionado, aplicá-lo
    if (headset && headsetMicSelected) {
      // Atualizar stream com dispositivo selecionado
      await startLocalStream(cameraSelect.value, headset.microphone.deviceId);
      
      // Aplicar ao audio output se suportado
      if (headset.speaker && typeof HTMLMediaElement.prototype.setSinkId === 'function') {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
          if (video.id !== 'video-local') {
            video.setSinkId(headset.speaker.deviceId);
          }
        });
      }
    }
  } catch (error) {
    console.error('Erro ao listar dispositivos:', error);
  }
}

// Detectar atividade de áudio para alternar o vídeo principal
function detectAudioActivity(stream, userId) {
  // Verificar se o stream tem faixas de áudio
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return;
  
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  let silenceTimer = 0;
  let isSpeaking = false;
  let volumeThreshold = 25; // Ajuste conforme necessário
  
  function checkAudio() {
    analyser.getByteFrequencyData(dataArray);
    
    // Calcular volume médio
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const average = sum / bufferLength;
    
    // Atualizar status de fala
    if (average > volumeThreshold) {
      // Está falando
      if (!isSpeaking) {
        isSpeaking = true;
        const container = document.getElementById(`container-${userId}`);
        if (container && activeSpeakerId !== userId && 
            // Apenas alterna para o falante se ele não for o que já está em PIP
            container.parentElement === pipContainer) {
          toggleMainVideo(userId);
        }
      }
      silenceTimer = 0;
    } else {
      // Silêncio
      silenceTimer++;
      // Após 2 segundos de silêncio, marcar como não falando
      if (silenceTimer > 60 && isSpeaking) {
        isSpeaking = false;
      }
    }
    
    // Continuar checando
    requestAnimationFrame(checkAudio);
  }
  
  // Iniciar detecção
  checkAudio();
}

// Formatar código de sala para exibição
function formatRoomCode(code) {
  if (code.includes('-')) return code;
  
  if (code.length === 10) {
    return `${code.substr(0, 3)}-${code.substr(3, 4)}-${code.substr(7, 3)}`;
  }
  
  return code;
}

// Event Listeners
toggleAudioButton.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  localStream.getAudioTracks().forEach(track => track.enabled = audioEnabled);
  toggleAudioButton.innerHTML = audioEnabled ? 
    '<i class="fas fa-microphone"></i>' : 
    '<i class="fas fa-microphone-slash"></i>';
  toggleAudioButton.classList.toggle('disabled', !audioEnabled);
  
  // Atualizar status no container de vídeo local
  const micStatus = document.querySelector('#container-local .mic-status');
  if (micStatus) {
    micStatus.innerHTML = audioEnabled ? 
      '<i class="fas fa-microphone"></i>' : 
      '<i class="fas fa-microphone-slash"></i>';
  }
  
  // Enviar status atualizado para outros participantes
  updateMediaStatus(audioEnabled, videoEnabled);
});

toggleVideoButton.addEventListener('click', () => {
  videoEnabled = !videoEnabled;
  localStream.getVideoTracks().forEach(track => track.enabled = videoEnabled);
  toggleVideoButton.innerHTML = videoEnabled ? 
    '<i class="fas fa-video"></i>' : 
    '<i class="fas fa-video-slash"></i>';
  toggleVideoButton.classList.toggle('disabled', !videoEnabled);
  
  // Atualizar visual do container de vídeo local
  const container = document.getElementById('container-local');
  if (container) {
    container.classList.toggle('video-off', !videoEnabled);
  }
  
  // Enviar status atualizado para outros participantes
  updateMediaStatus(audioEnabled, videoEnabled);
});

leaveButton.addEventListener('click', () => {
  disconnect();
  window.location.href = '/calls/';
});

// Mostrar/ocultar menus de configurações
audioSettingsButton.addEventListener('click', (e) => {
  e.stopPropagation();
  videoSettingsMenu.classList.add('hidden');
  audioSettingsMenu.classList.toggle('hidden');
});

videoSettingsButton.addEventListener('click', (e) => {
  e.stopPropagation();
  audioSettingsMenu.classList.add('hidden');
  videoSettingsMenu.classList.toggle('hidden');
});

// Fechar menus quando clicar fora deles
document.addEventListener('click', (e) => {
  if (!audioSettingsMenu.contains(e.target) && e.target !== audioSettingsButton) {
    audioSettingsMenu.classList.add('hidden');
  }
  if (!videoSettingsMenu.contains(e.target) && e.target !== videoSettingsButton) {
    videoSettingsMenu.classList.add('hidden');
  }
});

// Selecionar dispositivos
cameraSelect.addEventListener('change', async () => {
  await startLocalStream(cameraSelect.value, microphoneSelect.value);
});

microphoneSelect.addEventListener('change', async () => {
  await startLocalStream(cameraSelect.value, microphoneSelect.value);
});

speakerSelect.addEventListener('change', () => {
  if (typeof HTMLMediaElement.prototype.setSinkId === 'function') {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (video.id !== 'video-local') {
        video.setSinkId(speakerSelect.value);
      }
    });
  }
});

// Compartilhar link da reunião
shareButton.addEventListener('click', () => {
  shareDialog.classList.remove('hidden');
});

copyLinkButton.addEventListener('click', () => {
  meetingLinkInput.select();
  document.execCommand('copy');
  copyLinkButton.innerHTML = '<i class="fas fa-check"></i>';
  setTimeout(() => {
    copyLinkButton.innerHTML = '<i class="fas fa-copy"></i>';
  }, 2000);
});

closeShareButton.addEventListener('click', () => {
  shareDialog.classList.add('hidden');
});

shareDialog.addEventListener('click', (e) => {
  if (e.target === shareDialog) {
    shareDialog.classList.add('hidden');
  }
});

// Botão de debug
document.getElementById('debug-button').addEventListener('click', () => {
  try {
    const debugInfo = getDebugInfo();
    console.table(debugInfo.connections);
    alert(`Diagnóstico: ${Object.keys(debugInfo.connections).length} conexões\n` +
          `Online: ${debugInfo.network}\n` +
          `Suporte WebRTC: ${debugInfo.webRTCSupport}\n` +
          `Dispositivos de mídia: ${debugInfo.mediaDevices}\n` +
          `Veja mais detalhes no console`);
  } catch (error) {
    console.error('Erro ao obter informações de debug:', error);
    alert('Erro ao obter informações de debug. Veja o console para mais detalhes.');
  }
});

// Inicializar a aplicação
init();
