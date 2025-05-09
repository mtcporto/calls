// Verificar configuração WebRTC

// URL base do servidor de sinalização
const expectedServer = 'https://webrtc-signaling.mosaicoworkers.workers.dev';

// Função principal para validar a configuração
function checkWebRTCConfig() {
    console.log("Verificando configuração WebRTC...");
    
    // Verificar o servidor de sinalização
    console.log("Buscando módulo WebRTC...");
    
    // Tentar obter a URL do servidor de sinalização do módulo
    import('./webrtc.js').then(WebRTC => {
        const debugInfo = WebRTC.getDebugInfo();
        console.log("Informações de debug:", debugInfo);
        
        // Verificar servidor pelo método interno do webrtc.js
        fetch(`${expectedServer}/status`)
            .then(response => response.json())
            .then(data => {
                console.log("Servidor de sinalização respondeu:", data);
                showResult("success", "Servidor de sinalização está respondendo corretamente");
            })
            .catch(error => {
                console.error("Erro ao conectar ao servidor de sinalização:", error);
                showResult("error", `Erro ao conectar ao servidor de sinalização: ${error.message}`);
            });
    }).catch(error => {
        console.error("Erro ao carregar módulo WebRTC:", error);
        showResult("error", `Erro ao carregar módulo WebRTC: ${error.message}`);
    });
    
    // Verificar suporte ao WebRTC
    if (!window.RTCPeerConnection) {
        showResult("error", "Este navegador não suporta WebRTC");
        return;
    } else {
        showResult("info", "Navegador suporta WebRTC");
    }
    
    // Verificar se temos acesso à mídia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showResult("warning", "Este navegador não suporta acesso à câmera/microfone ou a permissão foi negada");
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
            .then(stream => {
                showResult("success", "Acesso à câmera e microfone concedido");
                // Garantir que liberamos os recursos
                stream.getTracks().forEach(track => track.stop());
            })
            .catch(error => {
                showResult("warning", `Erro ao acessar dispositivos de mídia: ${error.message}`);
            });
    }
}

// Função para mostrar resultados no DOM
function showResult(type, message) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;
    
    const resultDiv = document.createElement('div');
    resultDiv.className = `result ${type}`;
    resultDiv.innerHTML = `<span class="icon">${getIcon(type)}</span><span>${message}</span>`;
    
    resultsDiv.appendChild(resultDiv);
}

// Retornar ícone baseado no tipo de resultado
function getIcon(type) {
    switch(type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        case 'info': return 'ℹ️';
        default: return '•';
    }
}

// Se o script é carregado diretamente em uma página HTML
if (typeof document !== 'undefined') {
    // Executar verificação quando o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', checkWebRTCConfig);
}

export { checkWebRTCConfig };
