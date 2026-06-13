#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_PORT=3001
BACKEND_PORT=4000

cleanup() {
  echo "Cleaning up..."
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  exit $1
}

trap 'cleanup 1' ERR INT TERM

# Clean storage for fresh tests
rm -rf "$BACKEND_DIR/storage"/*

echo "Starting backend on port $BACKEND_PORT..."
cd "$BACKEND_DIR"
PORT=$BACKEND_PORT NODE_ENV=e2e npx tsx src/index.ts > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

echo "Starting frontend on port $FRONTEND_PORT..."
cd "$FRONTEND_DIR"
PORT=$FRONTEND_PORT ./node_modules/.bin/next dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for backend
echo "Waiting for backend..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
    echo "Backend ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Backend failed to start"
    cat /tmp/backend.log
    cleanup 1
  fi
  sleep 1
done

# Wait for frontend
echo "Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
    echo "Frontend ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Frontend failed to start"
    cat /tmp/frontend.log
    cleanup 1
  fi
  sleep 1
done

# Run tests
echo ""
echo "Running E2E tests..."
cd "$SCRIPT_DIR"
npx playwright test

EXIT_CODE=$?
cleanup $EXIT_CODE
