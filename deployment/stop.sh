#!/bin/bash
set -e

cd "$(dirname "$0")/.."
echo "Stopping PhotoEvent..."
docker compose down
