#!/bin/bash
set -e

cd "$(dirname "$0")/.."
echo "Stopping PhotoEvent..."
docker compose -f deployment/docker-compose.yml down
