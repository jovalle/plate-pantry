#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
EXAMPLE_FILE="${ROOT_DIR}/.env.example"

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "Error: .env.example not found at ${EXAMPLE_FILE}" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  echo "Existing .env found at ${ENV_FILE}"
  read -rp "Overwrite existing .env? (y/N): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

cp "$EXAMPLE_FILE" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo ""
echo "=== Plate Pantry Environment Setup ==="
echo "Created .env from .env.example"
echo ""

# Prompt for Public Origin
read -rp "Enter public origin URL [http://localhost:5360]: " INPUT_ORIGIN
PUBLIC_ORIGIN="${INPUT_ORIGIN:-http://localhost:5360}"
sed -i.bak "s|^PLATE_PANTRY_PUBLIC_ORIGIN=.*|PLATE_PANTRY_PUBLIC_ORIGIN=${PUBLIC_ORIGIN}|" "$ENV_FILE"

# Prompt for Port
read -rp "Enter external port [5360]: " INPUT_PORT
PORT="${INPUT_PORT:-5360}"
sed -i.bak "s|^PORT=.*|PORT=${PORT}|" "$ENV_FILE"

# Prompt for Origin Secret
read -rp "Generate a random secure origin secret? (Y/n): " GEN_SECRET
if [[ ! "$GEN_SECRET" =~ ^[Nn]$ ]]; then
  SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''))")
  sed -i.bak "s|^PLATE_PANTRY_ORIGIN_SECRET=.*|PLATE_PANTRY_ORIGIN_SECRET=${SECRET}|" "$ENV_FILE"
  echo "Generated PLATE_PANTRY_ORIGIN_SECRET."
fi

# Prompt for DMV Proxy
read -rp "Do lookups require an HTTP proxy (e.g. VPN/Gluetun)? (y/N): " USE_PROXY
if [[ "$USE_PROXY" =~ ^[Yy]$ ]]; then
  read -rp "Enter proxy URL (e.g. http://gluetun:8888): " PROXY_URL
  sed -i.bak "s|^DMV_PROXY_REQUIRED=.*|DMV_PROXY_REQUIRED=1|" "$ENV_FILE"
  sed -i.bak "s|^DMV_PROXY_URL=.*|DMV_PROXY_URL=${PROXY_URL}|" "$ENV_FILE"
fi

rm -f "${ENV_FILE}.bak"

echo ""
echo "Configuration complete! Your settings are saved in .env (mode 600)."
echo "To start the application:"
echo "  - Local development: npm run dev"
echo "  - Docker Compose:    docker compose up -d"
echo ""
