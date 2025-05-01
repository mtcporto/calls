const configuration = {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      },
      {
        urls: 'stun:stun1.l.google.com:19302'
      },
      {
        urls: 'stun:stun2.l.google.com:19302'
      },
      {
        urls: 'stun:stun3.l.google.com:19302'
      },
      {
        urls: 'stun:stun4.l.google.com:19302'
      }
    ]
  };
  
  const peerConnection = new RTCPeerConnection(configuration);
  
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      // Enviar o ICE candidate para o outro peer
      console.log('New ICE candidate:', event.candidate);
    }
  };
  
  // Função assíncrona para iniciar a chamada
  async function startCall() {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
  
      // Enviar a descrição da oferta para o outro peer
      console.log('Offer:', offer);
    } catch (error) {
      console.error('Error starting call:', error);
    }
  }
  
  // Função para configurar a descrição remota (recebida do outro peer)
  async function receiveAnswer(answer) {
    try {
      const remoteDesc = new RTCSessionDescription(answer);
      await peerConnection.setRemoteDescription(remoteDesc);
    } catch (error) {
      console.error('Error receiving answer:', error);
    }
  }
  
// webrtc.js

// Função para conectar à sala WebRTC
export async function connectToRoom(roomName, localStream, addRemoteVideo) {
    // Lógica para conexão à sala
}

// Função para adicionar o stream de vídeo a um elemento de vídeo
export function addStreamToVideoElement(stream, videoElement) {
    // Lógica para adicionar o stream ao elemento de vídeo
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
}

  // Exemplo de adicionar uma track (pode ser vídeo, áudio ou dados)
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  
  // Chame a função assíncrona para iniciar a chamada
  startCall();
  