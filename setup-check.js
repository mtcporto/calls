// Arquivo para verificação e configuração do ambiente WebRTC
// Este script irá verificar se todas as configurações necessárias estão corretas

const SIGNALING_SERVER = 'https://webrtc-signaling.mosaicoworkers.workers.dev';
const SUPABASE_URL = 'https://wcpgxyfuglaxotmjpgqwk.supabase.co';

// Log personalizado
function log(message, type = 'info') {
  const styles = {
    info: 'color: #4a6cf7; font-weight: bold;',
    success: 'color: #4bb543; font-weight: bold;',
    error: 'color: #ff3333; font-weight: bold;',
    warn: 'color: #ff9966; font-weight: bold;'
  };
  
  console.log(`%c[Setup Check] ${message}`, styles[type]);
}

// Verificar se a tabela webrtc_rooms existe e está acessível
async function checkTableStatus() {
  log('Verificando tabela webrtc_rooms...');
  
  try {
    const response = await fetch(`${SIGNALING_SERVER}/tablestatus`);
    const data = await response.json();
    
    if (data.success) {
      log(`Tabela webrtc_rooms encontrada. ${data.count} salas registradas.`, 'success');
      return true;
    } else {
      log(`Erro ao acessar tabela webrtc_rooms: ${data.error}`, 'error');
      log('Detalhes: ' + (data.details || 'Sem detalhes adicionais'), 'error');
      return false;
    }
  } catch (error) {
    log(`Exceção ao verificar tabela: ${error.message}`, 'error');
    return false;
  }
}

// Verificar o status do servidor de sinalização
async function checkSignalServerStatus() {
  log('Verificando servidor de sinalização...');
  
  try {
    const response = await fetch(`${SIGNALING_SERVER}/status`);
    const data = await response.json();
    
    if (data.success) {
      log(`Servidor de sinalização online. ${data.stats.rooms} salas ativas.`, 'success');
      return true;
    } else {
      log(`Servidor de sinalização com problemas: ${data.error}`, 'error');
      return false;
    }
  } catch (error) {
    log(`Exceção ao verificar servidor: ${error.message}`, 'error');
    return false;
  }
}

// Limpar salas expiradas
async function cleanupExpiredRooms() {
  log('Limpando salas expiradas...');
  
  try {
    const response = await fetch(`${SIGNALING_SERVER}/cleanup?key=seu-token-secreto`);
    const data = await response.json();
    
    if (data.success) {
      log('Limpeza de salas expiradas concluída com sucesso', 'success');
      return true;
    } else {
      log(`Erro ao limpar salas expiradas: ${data.error}`, 'warn');
      return false;
    }
  } catch (error) {
    log(`Exceção ao limpar salas: ${error.message}`, 'error');
    return false;
  }
}

// Verificar o suporte a WebRTC no navegador
function checkWebRTCSupport() {
  log('Verificando suporte a WebRTC no navegador...');
  
  const hasRTC = 'RTCPeerConnection' in window;
  const hasMediaDevices = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  const hasDataChannel = 'RTCDataChannel' in window;
  
  if (hasRTC && hasMediaDevices && hasDataChannel) {
    log('Navegador suporta todas as APIs WebRTC necessárias', 'success');
    return true;
  } else {
    log('Navegador não suporta todas as APIs WebRTC necessárias:', 'error');
    if (!hasRTC) log('- RTCPeerConnection não suportado', 'error');
    if (!hasMediaDevices) log('- getUserMedia não suportado', 'error');
    if (!hasDataChannel) log('- RTCDataChannel não suportado', 'error');
    return false;
  }
}

// Função principal para executar todas as verificações
async function runSetupCheck() {
  log('Iniciando verificação do ambiente WebRTC...');
  
  // Verificar o suporte no navegador
  const browserSupport = checkWebRTCSupport();
  
  // Verificar o servidor de sinalização
  const signalServerOk = await checkSignalServerStatus();
  
  // Verificar a tabela no Supabase
  const tableOk = await checkTableStatus();
  
  // Limpar salas expiradas (opcional)
  await cleanupExpiredRooms();
  
  // Resultado final
  if (browserSupport && signalServerOk && tableOk) {
    log('✅ Ambiente WebRTC configurado corretamente!', 'success');
    return true;
  } else {
    log('❌ Ambiente WebRTC com problemas. Verifique os erros acima.', 'error');
    return false;
  }
}

// Exportar funções para uso em outros arquivos
export {
  runSetupCheck,
  checkTableStatus,
  checkSignalServerStatus,
  cleanupExpiredRooms
};

// Executar verificação ao carregar em modo standalone
// Corrigido para não depender de document.currentScript que pode ser null
if (typeof window !== 'undefined') {
  // Verificar se está sendo executado como módulo principal
  const isMainModule = document?.currentScript?.getAttribute('data-run-check') === 'true';
  
  if (isMainModule) {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('Executando verificação automática do ambiente...');
      runSetupCheck();
    });
  }
}
