// Importar módulos do WebRTC de forma correta
import * as WebRTC from './webrtc.js';

const { connectToRoom, addStreamToVideoElement, disconnect, getDebugInfo, updateMediaStatus } = WebRTC;

console.log('Calls.js carregado');

// Verificar se as funções do webrtc.js estão sendo importadas corretamente
console.log('Funções importadas de webrtc.js:', {
  connectToRoom: typeof connectToRoom,
  addStreamToVideoElement: typeof addStreamToVideoElement,
  disconnect: typeof disconnect,
  getDebugInfo: typeof getDebugInfo
});

// Adicionar no início do arquivo, após as importações

// Log detalhado para diagnóstico
console.log('==== DIAGNÓSTICO WEBRTC MEET ====');
console.log('Versão: 1.2.1');
console.log('Data: ' + new Date().toISOString());
console.log('User Agent: ' + navigator.userAgent);
console.log('Suporte ao WebRTC:', 
  'RTCPeerConnection' in window ? 'Sim' : 'Não',
  'getUserMedia' in navigator.mediaDevices ? 'Sim' : 'Não',
  'RTCDataChannel' in window ? 'Sim' : 'Não'
);
console.log('================================');

// Log de erro global para capturar erros não tratados
window.addEventListener('error', function(event) {
  console.error('ERRO GLOBAL:', event.message, 'em', event.filename, 'linha', event.lineno);
});

// Variáveis
let localStream;
let audioEnabled = true;
let videoEnabled = true;
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

// Adicionar a definição da função handleResize e outras lógicas relacionadas ao layout
const MAX_VISIBLE_PIPS_DESKTOP = 4; // Máximo de PIPs visíveis em desktop

function handleResize() {
  const isMobile = window.innerWidth <= 768;
  const pipVideos = pipContainer.querySelectorAll('.video-container');

  if (isMobile) {
    // Em mobile, mostrar apenas o vídeo principal, ocultar todos os PIPs
    pipContainer.style.display = 'none';
    mainVideoContainer.style.flexGrow = '1'; // Ocupar todo o espaço
    pipVideos.forEach(pip => {
      pip.style.display = 'none';
    });
    // Garantir que o vídeo principal esteja visível e ajustado
    const mainVideo = mainVideoContainer.querySelector('.video-container video');
    if (mainVideo) {
        mainVideo.style.objectFit = 'contain';
    }

  } else {
    // Em desktop, mostrar PIPs e ajustar layout
    pipContainer.style.display = 'flex'; // Usar flex para organizar PIPs
    mainVideoContainer.style.flexGrow = '3'; // Dar mais espaço ao vídeo principal
    let visiblePips = 0;
    pipVideos.forEach(pip => {
      if (visiblePips < MAX_VISIBLE_PIPS_DESKTOP) {
        pip.style.display = 'flex'; // Usar flex para o container do PIP
        visiblePips++;
      } else {
        pip.style.display = 'none';
      }
    });
    // Ajustar o vídeo principal e os PIPs
    const mainVideo = mainVideoContainer.querySelector('.video-container video');
    if (mainVideo) {
        mainVideo.style.objectFit = 'contain';
    }
    pipVideos.forEach(pip => {
        const video = pip.querySelector('video');
        if (video) {
            video.style.objectFit = 'cover'; // PIPs podem usar cover
        }
    });
  }
  console.log(`Desktop: Garantindo que todos os ${pipVideos.length} PIPs estejam visíveis (máx ${MAX_VISIBLE_PIPS_DESKTOP} em desktop, mobile: ${isMobile}).`);
}

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
updateMeetingLink();

// Atualizar URL do link de compartilhamento
function updateMeetingLink() {
  // Obter a URL base do site atual
  const baseUrl = window.location.origin;
  const fullPath = window.location.pathname;
  
  // Determinar o path correto para a página calls.html
  let callsPath;
  if (fullPath.includes('/')) {
    // Obter o diretório atual
    const pathParts = fullPath.split('/');
    pathParts.pop(); // Remover o arquivo atual
    callsPath = pathParts.join('/') + '/calls.html';
  } else {
    callsPath = '/calls.html';
  }
  
  // Montar a URL completa para compartilhamento
  const shareUrl = `${baseUrl}${callsPath}?room=${roomCode}`;
  meetingLinkInput.value = shareUrl;
}

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
    let currentUserName = localStorage.getItem('userName');
    if (!currentUserName) {
      currentUserName = prompt("Por favor, digite seu nome:", "");
      if (!currentUserName || currentUserName.trim() === "") {
        currentUserName = "Anônimo";
      }
      localStorage.setItem('userName', currentUserName);
    }

    // Inicializar o stream local
    const stream = await startLocalStream().catch(error => {
      console.warn('Não foi possível acessar dispositivos de mídia:', error);
      // Criar um stream vazio para casos onde o usuário não tem dispositivos
      return createEmptyStreamWithPlaceholder();
    });
    
    // Criar container para vídeo local
    localVideoContainer = createVideoContainer('local', currentUserName + ' (Você)', stream);
    localVideoContainer.classList.add('local-video');
    
    if (!stream || stream.getTracks().length === 0) {
      localVideoContainer.classList.add('video-off');
      audioEnabled = false;
      videoEnabled = false;
      // Atualizar botões de controle para refletir estado
      if (toggleAudioButton) toggleAudioButton.classList.add('disabled');
      if (toggleVideoButton) toggleVideoButton.classList.add('disabled');
    }
    
    // Adicionar ao container principal primeiro
    mainVideoContainer.appendChild(localVideoContainer);
    
    // Conectar à sala WebRTC
    const connected = await connectToRoom(roomCode, stream, handleRemoteStream, currentUserName);
    
    if (!connected) {
      alert('Erro ao conectar à sala. Por favor, tente novamente.');
    }
    
    // Atualizar lista de dispositivos
    await updateDeviceList();
    
    // Detectar áudio do usuário local para active speaker
    if (stream && stream.getAudioTracks().length > 0) {
      detectAudioActivity(stream, 'local');
    }
  } catch (error) {
    console.error('Erro ao inicializar:', error);
    let currentUserName = localStorage.getItem('userName') || 'Anônimo'; // Garante que currentUserName seja definido no catch
    alert(`Não foi possível iniciar com mídia: Você entrará em modo somente visualização`);
    
    // Continuar sem mídia - modo somente visualização
    const emptyStream = createEmptyStreamWithPlaceholder();
    
    localVideoContainer = createVideoContainer('local', currentUserName + ' (Você)', emptyStream);
    localVideoContainer.classList.add('local-video');
    localVideoContainer.classList.add('video-off');
    
    audioEnabled = false;
    videoEnabled = false;
    
    // Atualizar botões de controle
    if (toggleAudioButton) toggleAudioButton.classList.add('disabled');
    if (toggleVideoButton) toggleVideoButton.classList.add('disabled');
    
    // Adicionar ao container principal
    mainVideoContainer.appendChild(localVideoContainer);
    
    // Conectar em modo somente visualização
    await connectToRoom(roomCode, emptyStream, handleRemoteStream, currentUserName);
    
    await updateDeviceList();
  }
  // Chamar handleResize após a inicialização e carregamento do DOM
  handleResize(); 
  // Adicionar listener para redimensionamento da janela
  window.addEventListener('resize', handleResize);
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

  // Adicionar classe video-off para streams remotos inicialmente
  if (id !== 'local') {
    container.classList.add('video-off');
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
  if (!container) {
    console.error(`Container para ${id} não encontrado`);
    return;
  }
  
  // Se este container já está no main, não fazer nada
  if (container.parentElement === mainVideoContainer) return;
  
  console.log(`Alternando vídeo principal para ${id}`);
  
  // Recuperar o container que está no main atualmente
  const mainVideo = mainVideoContainer.querySelector('.video-container');
  
  if (mainVideo) {
    // Mover o vídeo principal atual para o PIP
    mainVideoContainer.removeChild(mainVideo);
    pipContainer.appendChild(mainVideo);
    mainVideo.classList.remove('main-video');
    mainVideo.classList.add('pip-video');
    
    // Se o vídeo que estava como principal era o falante ativo, atualizar essa informação
    if (mainVideo.id === `container-${activeSpeakerId}`) {
      mainVideo.classList.remove('speaker-active');
    }
  }
  
  // Mover o container clicado para o main
  pipContainer.removeChild(container);
  mainVideoContainer.appendChild(container);
  container.classList.remove('pip-video');
  container.classList.add('main-video');
  
  // Atualizar o falante ativo
  activeSpeakerId = id;
  
  // Atualizar visualização do vídeo para melhor ajuste
  const video = container.querySelector('video');
  if (video) {
    // Forçar recálculo de dimensões para melhor visualização
    setTimeout(() => {
      video.style.height = '';
      video.style.width = '';
    }, 50);
  }
  
  // Disparar evento customizado de troca de vídeo principal
  const event = new CustomEvent('main-video-changed', { 
    detail: { id: id } 
  });
  window.dispatchEvent(event);
  handleResize(); // Chamar handleResize após trocar o vídeo principal
}

// Modificar a função handleRemoteStream para garantir que os vídeos PIP sejam exibidos corretamente
function handleRemoteStream(stream, userId, userName) {
  console.log(`Handle remote stream called for ${userId}, user: ${userName}`);
  
  const existingContainer = document.getElementById(`container-${userId}`);
  if (existingContainer) {
    const video = document.getElementById(`video-${userId}`);
    if (video) {
      console.log(`Atualizando stream para container existente ${userId}`);
      addStreamToVideoElement(stream, video, userId);
    }
    return;
  }
  
  console.log(`Criando novo container de vídeo para ${userId}`);
  const container = createVideoContainer(userId, userName || 'Participante', stream);
  
  if (!pipContainer) {
    console.error('Elemento pip-container não encontrado!');
    // Não tentar recriar aqui, pois deve existir desde o HTML.
    // Se não existir, é um erro de carregamento do DOM.
    return; 
  }
  
  const isMobile = window.innerWidth <= 768;
  
  if (mainVideoContainer.querySelector('.video-container')) {
    pipContainer.appendChild(container);
    container.classList.add('pip-video');
    console.log(`Adicionado ${userId} ao pipContainer.`);
  } else {
    mainVideoContainer.appendChild(container);
    container.classList.add('main-video');
    activeSpeakerId = userId;
    console.log(`Adicionado ${userId} ao mainVideoContainer como principal.`);
  }
  
  // Aplicar lógica de visibilidade de PIPs (especialmente após adicionar um novo)
  handleResize(); // Chamar handleResize para aplicar a lógica de exibição correta

  const video = document.getElementById(`video-${userId}`);
  if (video) {
    const videoContainerElement = document.getElementById(`container-${userId}`);
    if (videoContainerElement && window.getComputedStyle(videoContainerElement).display === 'none') {
        console.warn(`Container para ${userId} está com display:none antes de adicionar stream. Verificando lógica de handleResize.`);
        // A lógica de display já deve ser tratada por handleResize
    }
    addStreamToVideoElement(stream, video, userId);
    detectAudioActivity(stream, userId);
  } else {
    console.error(`Elemento de vídeo video-${userId} não encontrado após criar container.`);
  }
}

// Função para iniciar stream local
async function startLocalStream(videoDeviceId, audioDeviceId) {
  try {
    // Configuração para forçar o uso da câmera frontal em dispositivos móveis
    let videoConstraints;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (videoDeviceId) {
      // Se um deviceId específico foi fornecido, use-o
      videoConstraints = { deviceId: { exact: videoDeviceId } };
    } else {
      // Em dispositivos móveis, forçar o uso da câmera frontal
      if (isMobileDevice) {
        videoConstraints = { 
          facingMode: { exact: "user" }, // Força câmera frontal
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
        
        // Salvar preferência de câmera frontal para manter consistente
        localStorage.setItem('preferFrontCamera', 'true');
      } else {
        // Em desktop, usar configurações padrão
        videoConstraints = { 
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
      }
    }

    const constraints = {
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      video: videoConstraints
    };
    
    // Se já existe um stream, pare-o
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    console.log("Solicitando acesso à mídia com constraints:", JSON.stringify(constraints));
    
    // Obter novo stream
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("Stream local obtido com sucesso:", localStream.getTracks().map(t => `${t.kind}:${t.label}`));
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack && isMobileDevice) {
        const settings = videoTrack.getSettings();
        console.log("Configurações da track de vídeo no celular:", settings);
        if (settings.facingMode && settings.facingMode !== 'user') {
            console.warn(`Câmera frontal pode não ter sido selecionada no celular. Modo atual: ${settings.facingMode}.`);
        }
    }

    // Se já temos um container de vídeo, atualizar o stream
    const localVideo = document.getElementById('video-local');
    if (localVideo) {
      localVideo.srcObject = localStream;
      
      // Garantir que o vídeo seja reproduzido
      try {
        await localVideo.play();
        console.log("Playback de vídeo local iniciado");
      } catch (e) {
        console.warn("Erro ao iniciar playback de vídeo local:", e);
      }
    }
    
    return localStream;
  } catch (error) {
    console.error("Erro ao obter mídia local:", error);
    // Se falhar ao tentar forçar câmera frontal, tentar novamente sem exigência tão rígida
    if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
      console.log("Tentando novamente com configurações mais flexíveis...");
      try {
        const flexibleConstraints = {
          audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
          video: { facingMode: "user" } // Preferência por câmera frontal sem 'exact'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(flexibleConstraints);
        console.log("Stream local obtido com configurações flexíveis:", 
                   localStream.getTracks().map(t => `${t.kind}:${t.label}`));
        
        const videoTrackFallback = localStream.getVideoTracks()[0];
        if (videoTrackFallback && isMobileDevice) {
            const settingsFallback = videoTrackFallback.getSettings();
            console.log("Configurações da track de vídeo (fallback) no celular:", settingsFallback);
            if (settingsFallback.facingMode && settingsFallback.facingMode !== 'user') {
                console.warn(`Câmera frontal (fallback) pode não ter sido selecionada no celular. Modo atual: ${settingsFallback.facingMode}.`);
            }
        }

        const localVideo = document.getElementById('video-local');
        if (localVideo) {
          localVideo.srcObject = localStream;
          try {
            await localVideo.play();
          } catch (e) {
            console.warn("Erro ao iniciar playback com stream flexível:", e);
          }
        }
        
        return localStream;
      } catch (flexibleError) {
        console.error("Erro mesmo com configurações flexíveis:", flexibleError);
      }
    }
    // Retornar null em caso de erro para tratamento adequado
    return null;
  }
}

// Melhorar a lógica para priorizar headsets na função updateDeviceList()

async function updateDeviceList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Limpar seletores
    cameraSelect.innerHTML = '';
    microphoneSelect.innerHTML = '';
    speakerSelect.innerHTML = '';
    
    // Arrays para dispositivos
    const cameras = devices.filter(d => d.kind === 'videoinput');
    const microphones = devices.filter(d => d.kind === 'audioinput');
    const speakers = devices.filter(d => d.kind === 'audiooutput');
    
    console.log('Dispositivos detectados:', {
      cameras: cameras.length,
      microphones: microphones.length,
      speakers: speakers.length
    });
    
    // Identificar headsets (dispositivos com mesmo groupId para entrada e saída de áudio)
    const audioDeviceGroups = new Map();
    
    // Agrupar por groupId
    [...microphones, ...speakers].forEach(device => {
      if (!audioDeviceGroups.has(device.groupId)) {
        audioDeviceGroups.set(device.groupId, {
          groupId: device.groupId,
          name: device.label || 'Dispositivo desconhecido',
          microphone: null,
          speaker: null,
          isHeadset: false,
          score: 0  // Pontuação para priorização
        });
      }
      
      const group = audioDeviceGroups.get(device.groupId);
      
      if (device.kind === 'audioinput') {
        group.microphone = device;
      } else if (device.kind === 'audiooutput') {
        group.speaker = device;
      }
    });
    
    // Avaliar e pontuar os dispositivos de áudio para encontrar o melhor headset
    for (const group of audioDeviceGroups.values()) {
      // Critério principal: tem entrada e saída = possível headset
      if (group.microphone && group.speaker) {
        group.isHeadset = true;
        group.score += 10;
        
        // Critérios adicionais
        const name = group.name.toLowerCase();
        if (name.includes('headset') || name.includes('auricular') || name.includes('fone')) {
          group.score += 5;
        }
        if (name.includes('bluetooth')) {
          group.score += 3;
        }
        if (name.includes('usb')) {
          group.score += 2;
        }
      }
    }
    
    // Encontrar o melhor dispositivo de áudio
    let bestHeadset = null;
    let bestScore = -1;
    
    for (const group of audioDeviceGroups.values()) {
      if (group.score > bestScore) {
        bestHeadset = group;
        bestScore = group.score;
      }
    }
    
    console.log("Dispositivos de áudio agrupados:", Array.from(audioDeviceGroups.values()));
    console.log("Melhor headset detectado:", bestHeadset);
    
    // Adicionar câmeras ao select
    cameras.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Câmera ${cameraSelect.options.length + 1}`;
      cameraSelect.appendChild(option);
    });
    
    // Adicionar microfones ao select, priorizando o headset
    microphones.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Microfone ${microphoneSelect.options.length + 1}`;
      
      // Selecionar automaticamente o microfone do headset
      if (bestHeadset && bestHeadset.microphone && 
          device.deviceId === bestHeadset.microphone.deviceId) {
        option.selected = true;
      }
      
      microphoneSelect.appendChild(option);
    });
    
    // Adicionar alto-falantes ao select, priorizando o headset
    if (speakers.length > 0) {
      speakers.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Alto-falante ${speakerSelect.options.length + 1}`;
        
        // Selecionar automaticamente o alto-falante do headset
        if (bestHeadset && bestHeadset.speaker && 
            device.deviceId === bestHeadset.speaker.deviceId) {
          option.selected = true;
        }
        
        speakerSelect.appendChild(option);
      });
    } else {
      // Se não há seleção de saída de áudio disponível
      const option = document.createElement('option');
      option.value = '';
      option.text = 'Alto-falante padrão';
      speakerSelect.appendChild(option);
      speakerSelect.disabled = true;
    }
    
    // Iniciar o stream com os dispositivos selecionados
    if (microphones.length > 0) {
      const selectedMicId = microphoneSelect.value;
      const selectedCamId = cameraSelect.value;
      
      console.log(`Aplicando configurações: Câmera=${selectedCamId}, Microfone=${selectedMicId}`);
      await startLocalStream(selectedCamId, selectedMicId);
      
      // Aplicar o alto-falante selecionado a todos os vídeos
      if (typeof HTMLMediaElement.prototype.setSinkId === 'function' && speakerSelect.value) {
        const videos = document.querySelectorAll('video:not(#video-local)');
        videos.forEach(video => {
          video.setSinkId(speakerSelect.value).catch(e => {
            console.warn('Erro ao definir sink ID:', e);
          });
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
  if (!localStream) return;
  
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) {
    alert('Microfone não disponível. Conecte um microfone para ativar o áudio.');
    return;
  }
  
  audioEnabled = !audioEnabled;
  audioTracks.forEach(track => track.enabled = audioEnabled);
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
  if (!localStream) return;
  
  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) {
    alert('Câmera não disponível. Conecte uma câmera para ativar o vídeo.');
    return;
  }
  
  videoEnabled = !videoEnabled;
  videoTracks.forEach(track => track.enabled = videoEnabled);
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
  window.location.href = 'index.html';
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

// Garantir que o evento DOMContentLoaded seja disparado antes de inicializar
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado, verificando elementos críticos:');
  
  // Verificar se os elementos críticos foram carregados
  if (!toggleAudioButton || !toggleVideoButton || !mainVideoContainer || !pipContainer) {
    console.error('Elementos críticos não encontrados!', {
      toggleAudioButton: !!toggleAudioButton,
      toggleVideoButton: !!toggleVideoButton,
      mainVideoContainer: !!mainVideoContainer,
      pipContainer: !!pipContainer
    });
    
    // Tentar recarregar os elementos
    setTimeout(() => {
      window.location.reload();
    }, 3000);
    return;
  }
  
  console.log('- toggleAudioButton:', toggleAudioButton ? 'OK' : 'Não encontrado');
  console.log('- toggleVideoButton:', toggleVideoButton ? 'OK' : 'Não encontrado');
  console.log('- mainVideoContainer:', mainVideoContainer ? 'OK' : 'Não encontrado');
  console.log('- pipContainer:', pipContainer ? 'OK' : 'Não encontrado');
  
  // Inicializar a aplicação
  init().catch(error => {
    console.error('Erro na inicialização:', error);
    alert(`Não foi possível inicializar a aplicação: ${error.message}`);
  });
});

// Ouvir eventos de status de mídia remota
window.addEventListener('remote-media-status', (event) => {
  const { peerId, audio, video } = event.detail;
  
  // Atualizar ícones de status para o participante
  const container = document.getElementById(`container-${peerId}`);
  if (container) {
    // Atualizar status de microfone
    const micStatus = container.querySelector('.mic-status');
    if (micStatus) {
      micStatus.innerHTML = audio ? 
        '<i class="fas fa-microphone"></i>' : 
        '<i class="fas fa-microphone-slash"></i>';
      micStatus.classList.toggle('disabled', !audio);
    }
    
    // Atualizar status de vídeo (adicionar um indicador visual quando o vídeo estiver desligado)
    container.classList.toggle('video-off', !video);
  }
});

// Em calls.js, adicionar esse listener
window.addEventListener('video-active', (event) => {
  const { peerId } = event.detail;
  const container = document.getElementById(`container-${peerId}`);
  if (container) {
    console.log(`Evento video-active recebido para ${peerId}. Removendo video-off.`);
    container.classList.remove('video-off');
    container.classList.add('video-active'); 
  }
});

// Função para criar um stream vazio quando não há dispositivos disponíveis
function createEmptyStreamWithPlaceholder() {
  // Criar um canvas como fonte de vídeo placeholder
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  
  // Desenhar um fundo simples com texto
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Câmera não disponível', canvas.width/2, canvas.height/2 - 20);
  
  ctx.font = '16px Arial';
  ctx.fillText('Você está no modo somente visualização', canvas.width/2, canvas.height/2 + 20);
  
  // Criar um stream a partir do canvas
  let placeholderStream;
  
  try {
    // Tentar criar um stream do canvas
    placeholderStream = canvas.captureStream();
  } catch(e) {
    console.error('Erro ao criar stream do canvas:', e);
    // Se falhar, retornar um MediaStream vazio
    placeholderStream = new MediaStream();
  }
  
  return placeholderStream;
}

// No início do arquivo, após a declaração das variáveis
window.addEventListener('DOMContentLoaded', () => {
  // Verificar se o container PIP existe e criá-lo caso não exista
  if (!pipContainer) {
    console.log("Criando container PIP na inicialização");
    const videoArea = document.querySelector('.video-area');
    if (videoArea) {
      const newPipContainer = document.createElement('div');
      newPipContainer.id = 'pip-container';
      newPipContainer.className = 'pip-container';
      videoArea.appendChild(newPipContainer);
      pipContainer = newPipContainer;
    } else {
      console.error("Área de vídeo não encontrada para criar container PIP");
    }
  }

  // Verificar adaptação para dispositivos móveis
  const handleResize = () => {
    const isMobile = window.innerWidth <= 768;
    document.documentElement.classList.toggle('mobile', isMobile);

    if (pipContainer) {
      const pips = pipContainer.querySelectorAll('.video-container');
      if (isMobile) {
        // Em dispositivos móveis, CSS agora controla para mostrar apenas o primeiro PIP
        // Esta lógica JS pode ser simplificada ou removida se o CSS for suficiente
        pips.forEach((pip, index) => {
            // O CSS :not(:first-child) { display: none !important; } deve cuidar disso
            // Mas para garantir consistência com JS, podemos manter:
             pip.style.display = (index === 0) ? 'block' : 'none';
        });
        if (pips.length > 1) {
            console.log("Mobile: Mostrando apenas o primeiro PIP, escondendo os demais.");
        }
      } else {
        // Em desktop, mostrar todos os PIPs
        console.log(`Desktop: Garantindo que todos os ${pips.length} PIPs estejam visíveis.`);
        pips.forEach(pip => {
          pip.style.display = 'block'; // Ou 'flex' se o container usar display:flex
        });
      }
    }
  };

  // Executar o ajuste inicial e adicionar listener para redimensionamento
  handleResize();
  window.addEventListener('resize', handleResize);
});

