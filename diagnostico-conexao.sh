#!/bin/bash

# Script para diagnóstico e correção de problemas WebRTC
echo "===== Diagnóstico de Conexão WebRTC ====="
echo "Data: $(date)"

# Verificar se o servidor está rodando
echo -e "\n=== Verificando servidor de sinalização ==="
curl -s https://webrtc-signaling.mosaicoworkers.workers.dev/status | grep -q "success"
RESULT=$?
if [ $RESULT -eq 0 ]; then
  echo "✅ Servidor de sinalização está online"
else
  echo "❌ Servidor de sinalização não está respondendo!"
  echo "Tentando acessar servidor:"
  curl -v https://webrtc-signaling.mosaicoworkers.workers.dev/status
fi

# Verificar tabela no Supabase
echo -e "\n=== Verificando tabela no Supabase ==="
curl -s https://webrtc-signaling.mosaicoworkers.workers.dev/tablestatus | grep -q "success"
RESULT=$?
if [ $RESULT -eq 0 ]; then
  echo "✅ Tabela no Supabase está acessível"
  echo "Detalhes:"
  curl -s https://webrtc-signaling.mosaicoworkers.workers.dev/tablestatus
else
  echo "❌ Problema ao acessar tabela no Supabase!"
  echo "Detalhes:"
  curl -s https://webrtc-signaling.mosaicoworkers.workers.dev/tablestatus
fi

# Verificar arquivos necessários
echo -e "\n=== Verificando arquivos necessários ==="

FILES=("webrtc.js" "calls.js" "worker.js" "connection-fix.js")
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file existe"
  else
    echo "❌ $file não encontrado!"
  fi
done

# Verificar configurações STUN/TURN
echo -e "\n=== Verificando configurações STUN/TURN ==="
grep -q "stun:stun.l.google.com:19302" webrtc.js
if [ $? -eq 0 ]; then
  echo "✅ Servidor STUN configurado"
else
  echo "❌ Servidor STUN não configurado corretamente!"
fi

grep -q "turn:openrelay.metered.ca" webrtc.js
if [ $? -eq 0 ]; then
  echo "✅ Servidor TURN configurado"
else
  echo "❌ Servidor TURN não configurado corretamente!"
fi

# Verificar bibliotecas JavaScript
echo -e "\n=== Verificando exportações em webrtc.js ==="
grep -q "export function reprocessPendingSignals" webrtc.js
if [ $? -eq 0 ]; then
  echo "✅ Função reprocessPendingSignals implementada"
else
  echo "❌ Função reprocessPendingSignals não encontrada!"
fi

grep -q "export function getPeerConnections" webrtc.js
if [ $? -eq 0 ]; then
  echo "✅ Função getPeerConnections implementada"
else
  echo "❌ Função getPeerConnections não encontrada!"
fi

echo -e "\n=== Resumo ==="
echo "1. Execute o servidor web simples: python -m http.server 8000"
echo "2. Abra http://localhost:8000/conexao-diagnostico.html em dois navegadores diferentes"
echo "3. Entre na mesma sala em ambos os navegadores"
echo "4. Use 'Executar Diagnóstico' e 'Reparar Conexões' para diagnosticar e corrigir problemas"

echo -e "\nDiagnóstico concluído!"
