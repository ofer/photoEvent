#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# --- Auto-detect host IP so the QR code URL is reachable from phones ---
HOST_IP=$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i !~ /^127\./) {print $i; exit}}')
HOST_IP=${HOST_IP:-127.0.0.1}
FRONTEND_PORT=3300
CAPTURE_URL="http://${HOST_IP}:${FRONTEND_PORT}/capture"

# Write .env so docker-compose passes CAPTURE_URL to the backend container
# Only overwrite if the file doesn't exist (preserve user overrides)
if [ ! -f deployment/.env ]; then
  echo "EVENT_NAME=${EVENT_NAME:-PhotoEvent}" > deployment/.env
  echo "EVENT_YEAR=${EVENT_YEAR:-2026}" >> deployment/.env
  echo "CAPTURE_URL=${CAPTURE_URL}" >> deployment/.env
  echo "Detected host IP: ${HOST_IP} (QR points to ${CAPTURE_URL})"
  echo "  Override: edit deployment/.env or export CAPTURE_URL before running"
  echo ""
fi

echo "Starting PhotoEvent..."
docker compose -f deployment/docker-compose.yml up -d
echo ""
echo "Services running:"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  Backend:  http://localhost:4400"
echo "  QR code:  ${CAPTURE_URL}/capture  (for phones on your network)"
