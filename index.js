// Elementos DOM
const joinTab = document.getElementById('join-tab');
const createTab = document.getElementById('create-tab');
const switchToCreateBtn = document.getElementById('switch-to-create');
const switchToJoinBtn = document.getElementById('switch-to-join');
const joinForm = document.getElementById('join-form');
const createForm = document.getElementById('create-form');
const joinNameInput = document.getElementById('join-name');
const createNameInput = document.getElementById('create-name');
const roomCodeInput = document.getElementById('room-code');

// Alternar entre abas
switchToCreateBtn.addEventListener('click', (e) => {
  e.preventDefault();
  joinTab.classList.remove('active');
  createTab.classList.add('active');
  
  // Copiar o nome se já foi digitado
  if (joinNameInput.value) {
    createNameInput.value = joinNameInput.value;
  } else if (localStorage.getItem('userName')) {
    createNameInput.value = localStorage.getItem('userName');
  }
});

switchToJoinBtn.addEventListener('click', (e) => {
  e.preventDefault();
  createTab.classList.remove('active');
  joinTab.classList.add('active');
  
  // Copiar o nome se já foi digitado
  if (createNameInput.value) {
    joinNameInput.value = createNameInput.value;
  } else if (localStorage.getItem('userName')) {
    joinNameInput.value = localStorage.getItem('userName');
  }
});

// Preencher o nome do usuário se já estiver salvo
if (localStorage.getItem('userName')) {
  joinNameInput.value = localStorage.getItem('userName');
  createNameInput.value = localStorage.getItem('userName');
}

// Função para gerar código de sala aleatório no formato XXX-XXXX-XXX
function generateRoomCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let code = '';
  
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += '-';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

// Manipular formulário de entrada
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const userName = joinNameInput.value.trim();
  let roomCode = roomCodeInput.value.trim();

  if (!userName) {
    alert('Por favor, digite seu nome.');
    return;
  }

  // Processar o código da sala:
  // 1. Converter para minúsculas
  // 2. Remover caracteres não alfabéticos (hífens, espaços, números, etc.)
  const cleanedRoomCode = roomCode.toLowerCase().replace(/[^a-z]/g, '');

  if (!cleanedRoomCode) {
    alert('Por favor, digite o código da sala.');
    return;
  }

  // Validar o formato do código da sala (deve ter 10 letras após a limpeza)
  if (cleanedRoomCode.length !== 10) {
    alert('Código da sala inválido. O formato correto é xxx-xxxx-xxx ou 10 letras.');
    return;
  }

  // Salvar nome do usuário
  localStorage.setItem('userName', userName);

  // Usar o código limpo para o redirecionamento
  window.location.href = `calls.html?room=${cleanedRoomCode}`;
});

// Manipular formulário de criação
createForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const userName = createNameInput.value.trim();
  
  if (!userName) {
    alert('Por favor, digite seu nome.');
    return;
  }
  
  // Salvar nome do usuário
  localStorage.setItem('userName', userName);
  
  // Gerar código aleatório
  const roomCode = generateRoomCode();
  
  // Sempre redirecionar para o formato simples e seguro
  window.location.href = `calls.html?room=${roomCode}`;
});

// Verificar se há código na URL (para facilitar entrada em reuniões compartilhadas)
const urlParams = new URLSearchParams(window.location.search);
const urlCode = urlParams.get('room');
if (urlCode) {
  roomCodeInput.value = urlCode;
}

// Se a URL contém código de sala no formato /meet/XXX-XXXX-XXX (para compatibilidade)
const urlPath = window.location.pathname;
if (urlPath.includes('/meet/')) {
  const pathCode = urlPath.split('/meet/')[1];
  if (pathCode) {
    roomCodeInput.value = pathCode;
  }
}