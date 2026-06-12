#!/bin/bash
set -e

cd "$(dirname "$0")/.."
echo "Starting PhotoEvent..."
docker compose -f deployment/docker-compose.yml up -d
echo ""
echo "Services running:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000"
echo "  API:      http://localhost:4000/api"
