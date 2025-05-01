const room = new URLSearchParams(window.location.search).get('room');
document.getElementById('room-name').textContent = `Sala: ${room}`;

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

const leaveButton = document.getElementById('leave-button');
const muteButton = document.getElementById('mute-button');
const cameraButton = document.getElementById('camera-button');

let localStream;
let remoteStream;
let peerConnection;
let isMuted = false;
let isCameraOff = false;

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:turnserver.example.org', username: 'user', credential: 'pass' }
  ]
};

async function startLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  localVideo.srcObject = localStream;
}

async function init() {
  await startLocalStream();

  peerConnection = new RTCPeerConnection(configuration);

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = event => {
    remoteStream = event.streams[0];
    remoteVideo.srcObject = remoteStream;
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  // Signaling code to send the offer to the remote peer would go here

  leaveButton.addEventListener('click', () => {
    peerConnection.close();
    // Signaling code to inform the remote peer would go here
    window.location.href = 'sala.html';
  });

  muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
  });

  cameraButton.addEventListener('click', () => {
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks()[0].enabled = !isCameraOff;
    cameraButton.textContent = isCameraOff ? 'Camera On' : 'Camera Off';
  });
}

init();
