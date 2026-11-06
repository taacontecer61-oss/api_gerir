#!/usr/bin/env bash
# Corre no servidor Linux, dentro da pasta da API, depois de enviar o pacote.
set -euo pipefail
cd "$(dirname "$0")"

major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$major" != "22" ]; then
  echo "Este backend exige Node.js 22. Versão actual: $(node -v)"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Falta o ficheiro .env. Copie .env.production.example para .env e preencha os valores da Hostinger."
  exit 1
fi

if [ ! -f dist/index.js ]; then
  echo "Falta dist/index.js. Envie o pacote gerado por npm run pack:release, ou corra npm run build nesta máquina com as devDependencies instaladas."
  exit 1
fi

npm ci --omit=dev
mkdir -p storage/media
node dist/db/migrate.js
echo "Migrações aplicadas. Arranque com: npm start"
echo "No VPS, em alternativa: pm2 start ecosystem.config.cjs"
echo "A primeira conta de administrador, uma vez: node dist/db/seed.js"
