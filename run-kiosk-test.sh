#!/bin/bash
set -e

# Clean up function
cleanup() {
  echo "Cleaning up..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
}
trap cleanup EXIT

# Start backend
cd /home/ofer/repos/photoEvent/backend
npx tsx watch src/index.ts &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend
for i in $(seq 1 20); do
  if curl -s http://localhost:4000/api/health > /dev/null 2>&1; then
    echo "Backend ready"
    break
  fi
  sleep 1
done

# Start frontend
cd /home/ofer/repos/photoEvent/frontend
BACKEND_URL=http://localhost:4000 npx next dev -p 3002 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

# Wait for frontend
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/kiosk | grep -q 200; then
    echo "Frontend ready"
    break
  fi
  sleep 1
done

# Run the test
cd /home/ofer/repos/photoEvent
npx playwright test tests/kiosk.spec.ts --reporter=list --timeout=60000
TEST_EXIT=$?

cleanup
exit $TEST_EXIT
