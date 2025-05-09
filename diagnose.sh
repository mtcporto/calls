#!/bin/bash
# Script de diagnóstico para WebRTC com Supabase
# Este script irá verificar a conectividade com o servidor de sinalização e o banco de dados Supabase

echo "=== Diagnóstico WebRTC + Supabase ==="
echo "Data: $(date)"
echo "-----------------------------------"

# Verificar conectividade básica
echo "Verificando conectividade básica..."
if ping -c 1 8.8.8.8 &> /dev/null; then
  echo "✅ Conectividade com internet: OK"
else
  echo "❌ Problema de conectividade com internet"
fi

# Verificar resolver DNS
echo -e "\nVerificando DNS..."
if nslookup wcpgxyfuglaxotmjgqwk.supabase.co &> /dev/null; then
  echo "✅ Resolução DNS para Supabase: OK"
else
  echo "❌ Problema na resolução DNS do Supabase"
fi

if nslookup webrtc-signaling.mosaicoworkers.workers.dev &> /dev/null; then
  echo "✅ Resolução DNS para o servidor de sinalização: OK"
else
  echo "❌ Problema na resolução DNS do servidor de sinalização"
fi

# Verificar servidor de sinalização
echo -e "\nVerificando servidor de sinalização..."
SIGNAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://webrtc-signaling.mosaicoworkers.workers.dev/status)

if [ "$SIGNAL_STATUS" -eq 200 ]; then
  echo "✅ Servidor de sinalização respondendo: OK (HTTP $SIGNAL_STATUS)"
  
  # Obter detalhes do status
  echo "📊 Detalhes do servidor de sinalização:"
  curl -s https://webrtc-signaling.mosaicoworkers.workers.dev/status | grep -E "rooms|totalUsers|totalSignals|success" | sed 's/[{},"]//g' | sed 's/^/   - /'
else
  echo "❌ Servidor de sinalização com problemas: HTTP $SIGNAL_STATUS"
fi

# Verificar conectividade com Supabase
echo -e "\nVerificando conectividade com Supabase..."
TABLE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://webrtc-signaling.mosaicoworkers.workers.dev/tablestatus)

if [ "$TABLE_STATUS" -eq 200 ]; then
  echo "✅ Conexão com tabela do Supabase: OK (HTTP $TABLE_STATUS)"
  
  # Obter detalhes do status da tabela
  echo "📊 Detalhes da tabela webrtc_rooms:"
  curl -s https://webrtc-signaling.mosaicoworkers.workers.dev/tablestatus | grep -E "count|supabaseUrl|success" | sed 's/[{},"]//g' | sed 's/^/   - /'
else
  echo "❌ Problema de conexão com tabela do Supabase: HTTP $TABLE_STATUS"
fi

# Verificar se os arquivos estão configurados corretamente
echo -e "\nVerificando arquivos de configuração..."

# Verificar worker.js
if grep -q "Authorization.*Bearer" worker.js; then
  echo "✅ worker.js: Headers de autorização configurados corretamente"
else
  echo "❌ worker.js: Headers de autorização ausentes ou incorretos"
fi

# Verificar webrtc.js
if grep -q "https://webrtc-signaling.mosaicoworkers.workers.dev" webrtc.js; then
  echo "✅ webrtc.js: URL do servidor de sinalização configurada corretamente"
else
  echo "❌ webrtc.js: URL do servidor de sinalização incorreta"
fi

# Conclusão
echo -e "\n=== Verificação concluída ==="
echo "Execute o comando 'curl https://webrtc-signaling.mosaicoworkers.workers.dev/status' para obter mais detalhes do servidor"
echo "Use a ferramenta supabase-check.html para diagnósticos adicionais no navegador"
