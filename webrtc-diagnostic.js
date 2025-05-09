// Utilitários para diagnóstico e recuperação de WebRTC
// Este arquivo contém funções para diagnosticar e resolver problemas comuns

// Constantes
const SIGNALING_SERVER = 'https://webrtc-signaling.mosaicoworkers.workers.dev';
const SUPABASE_URL = 'https://wcpgxyfuglaxotmjgqwk.supabase.co';

// Classe de diagnóstico WebRTC
class WebRTCDiagnostic {
  constructor() {
    this.testResults = {};
    this.maxRetryCount = 3;
  }

  // Iniciar diagnóstico completo
  async runFullDiagnostic() {
    console.log('[Diagnóstico] Iniciando diagnóstico completo do WebRTC');
    
    try {
      // Verificar suporte do navegador
      this.testResults.browserSupport = await this.checkBrowserSupport();
      
      // Verificar acesso a dispositivos
      this.testResults.deviceAccess = await this.checkDeviceAccess();
      
      // Verificar servidor de sinalização
      this.testResults.signalServer = await this.checkSignalingServer();
      
      // Verificar conexão com Supabase
      this.testResults.supabase = await this.checkSupabase();
      
      // Verificar conectividade ICE
      this.testResults.ice = await this.checkICEConnectivity();
      
      return {
        success: this.isSuccessful(),
        results: this.testResults,
        recommendations: this.getRecommendations()
      };
    } catch (error) {
      console.error('[Diagnóstico] Erro no diagnóstico:', error);
      return {
        success: false,
        error: error.message,
        results: this.testResults,
        recommendations: ['Ocorreu um erro durante o diagnóstico. Verifique a conexão com a internet e tente novamente.']
      };
    }
  }
  
  // Verificar se diagnóstico foi bem-sucedido
  isSuccessful() {
    const requiredTests = ['browserSupport', 'signalServer'];
    return requiredTests.every(test => this.testResults[test]?.success);
  }
  
  // Obter recomendações com base nos resultados
  getRecommendations() {
    const recommendations = [];
    
    // Verificar resultados e adicionar recomendações
    if (!this.testResults.browserSupport?.success) {
      recommendations.push('Use um navegador mais recente com suporte completo a WebRTC (Chrome, Firefox, Edge ou Safari).');
    }
    
    if (!this.testResults.deviceAccess?.success) {
      recommendations.push('Permita o acesso à câmera e ao microfone nas configurações do navegador.');
    }
    
    if (!this.testResults.signalServer?.success) {
      recommendations.push('Verifique sua conexão com a internet ou tente novamente mais tarde.');
    }
    
    if (!this.testResults.supabase?.success) {
      recommendations.push('Problemas com o banco de dados. Tente recarregar a página ou contate o suporte.');
    }
    
    if (!this.testResults.ice?.success) {
      recommendations.push('Sua rede pode estar bloqueando conexões WebRTC. Tente usar uma rede diferente ou desativar firewalls.');
    }
    
    return recommendations;
  }
  
  // Verificar suporte do navegador
  async checkBrowserSupport() {
    console.log('[Diagnóstico] Verificando suporte do navegador');
    
    const hasRTC = 'RTCPeerConnection' in window;
    const hasMediaDevices = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
    const hasDataChannel = 'RTCDataChannel' in window;
    
    const success = hasRTC && hasMediaDevices && hasDataChannel;
    const details = {
      rtcPeerConnection: hasRTC,
      getUserMedia: hasMediaDevices,
      rtcDataChannel: hasDataChannel,
      userAgent: navigator.userAgent
    };
    
    return { success, details };
  }
  
  // Verificar acesso a dispositivos
  async checkDeviceAccess() {
    console.log('[Diagnóstico] Verificando acesso a dispositivos');
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === 'videoinput');
      const hasMicrophone = devices.some(device => device.kind === 'audioinput');
      
      return {
        success: hasCamera && hasMicrophone,
        details: {
          hasCamera,
          hasMicrophone,
          cameras: devices.filter(d => d.kind === 'videoinput').length,
          microphones: devices.filter(d => d.kind === 'audioinput').length
        }
      };
    } catch (error) {
      console.error('[Diagnóstico] Erro ao verificar dispositivos:', error);
      return {
        success: false,
        details: {
          error: error.message
        }
      };
    }
  }
  
  // Verificar servidor de sinalização
  async checkSignalingServer() {
    console.log('[Diagnóstico] Verificando servidor de sinalização');
    
    try {
      const startTime = performance.now();
      const response = await fetch(`${SIGNALING_SERVER}/status`);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      if (response.ok) {
        const data = await response.json();
        return {
          success: data.success,
          details: {
            latency,
            ...data
          }
        };
      } else {
        return {
          success: false,
          details: {
            status: response.status,
            statusText: response.statusText,
            latency
          }
        };
      }
    } catch (error) {
      console.error('[Diagnóstico] Erro ao verificar servidor de sinalização:', error);
      return {
        success: false,
        details: {
          error: error.message,
          url: SIGNALING_SERVER
        }
      };
    }
  }
  
  // Verificar conexão com Supabase
  async checkSupabase() {
    console.log('[Diagnóstico] Verificando conexão com Supabase');
    
    try {
      const response = await fetch(`${SIGNALING_SERVER}/tablestatus`);
      
      if (response.ok) {
        const data = await response.json();
        return {
          success: data.success,
          details: data
        };
      } else {
        return {
          success: false,
          details: {
            status: response.status,
            statusText: response.statusText
          }
        };
      }
    } catch (error) {
      console.error('[Diagnóstico] Erro ao verificar Supabase:', error);
      return {
        success: false,
        details: {
          error: error.message,
          url: SUPABASE_URL
        }
      };
    }
  }
  
  // Verificar conectividade ICE
  async checkICEConnectivity() {
    console.log('[Diagnóstico] Verificando conectividade ICE');
    
    try {
      // Criar peer connections de teste
      const pc1 = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });
      
      const pc2 = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });
      
      // Promises para tracking
      const iceConnected = new Promise((resolve) => {
        pc2.oniceconnectionstatechange = () => {
          if (pc2.iceConnectionState === 'connected' || 
              pc2.iceConnectionState === 'completed') {
            resolve(true);
          }
        };
      });
      
      const iceFailed = new Promise((resolve) => {
        pc2.oniceconnectionstatechange = () => {
          if (pc2.iceConnectionState === 'failed' || 
              pc2.iceConnectionState === 'disconnected') {
            resolve(false);
          }
        };
      });
      
      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => resolve(false), 5000);
      });
      
      // Adicionar canal de dados para forçar candidatos ICE
      pc1.createDataChannel('test');
      
      // Conectar os peers
      const offer = await pc1.createOffer();
      await pc1.setLocalDescription(offer);
      await pc2.setRemoteDescription(offer);
      
      const answer = await pc2.createAnswer();
      await pc2.setLocalDescription(answer);
      await pc1.setRemoteDescription(answer);
      
      // Trocar candidatos ICE
      pc1.onicecandidate = e => {
        if (e.candidate) pc2.addIceCandidate(e.candidate);
      };
      
      pc2.onicecandidate = e => {
        if (e.candidate) pc1.addIceCandidate(e.candidate);
      };
      
      // Esperar resultado com timeout
      const result = await Promise.race([
        iceConnected, 
        iceFailed,
        timeoutPromise
      ]);
      
      // Limpar recursos
      pc1.close();
      pc2.close();
      
      return {
        success: result === true,
        details: {
          iceConnectionState: pc2.iceConnectionState
        }
      };
    } catch (error) {
      console.error('[Diagnóstico] Erro ao verificar conectividade ICE:', error);
      return {
        success: false,
        details: {
          error: error.message
        }
      };
    }
  }
  
  // Tentar recuperar conexão com servidor de sinalização
  async attemptSignalingRecovery() {
    console.log('[Recuperação] Tentando recuperar conexão com servidor de sinalização');
    
    let attempt = 0;
    let success = false;
    
    while (attempt < this.maxRetryCount && !success) {
      attempt++;
      console.log(`[Recuperação] Tentativa ${attempt} de ${this.maxRetryCount}`);
      
      try {
        const response = await fetch(`${SIGNALING_SERVER}/status`, { 
          cache: 'no-store',
          timeout: 5000
        });
        
        success = response.ok;
        
        if (success) {
          console.log('[Recuperação] Conexão com servidor de sinalização restaurada');
          return true;
        } else {
          console.warn(`[Recuperação] Tentativa ${attempt} falhou: ${response.status}`);
          // Esperar antes da próxima tentativa
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`[Recuperação] Erro na tentativa ${attempt}:`, error);
        // Esperar antes da próxima tentativa
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('[Recuperação] Todas as tentativas falharam');
    return false;
  }
}

// Exportar classe para uso em outros arquivos
export default WebRTCDiagnostic;
