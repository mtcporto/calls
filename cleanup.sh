#!/bin/bash
# Script para remover arquivos desnecessários do projeto WebRTC

echo "Removendo arquivos desnecessários do projeto..."

# Remover arquivos relacionados ao Node.js/npm
rm -rf node_modules
rm -f package.json package-lock.json

# Remover arquivos relacionados ao Wrangler/Cloudflare
rm -f wrangler.toml
rm -f start-server.sh

# Remover arquivos temporários ou de backup
rm -f *~
rm -f *.bak
rm -f .DS_Store

# Dar permissão de execução ao script
chmod +x cleanup.sh

echo "Limpeza concluída! Os seguintes arquivos foram mantidos:"
ls -la | grep -v "node_modules"

echo ""
echo "O servidor de sinalização WebRTC já está configurado para usar Supabase!"
