#!/bin/bash
# Run screen_sharing test with node and dart signaling servers

set -e
cd "$(dirname "$0")"

cleanup() {
  pkill -f "node server.js" 2>/dev/null || true
  pkill -f "dart.*server.dart" 2>/dev/null || true
}
trap cleanup EXIT

run_test() {
  local server=$1
  cleanup
  sleep 1

  if [ "$server" = "dart" ]; then
    echo "=== Testing with Dart signaling server ==="
    dart run server.dart &
  else
    echo "=== Testing with Node.js signaling server ==="
    node server.js &
  fi

  sleep 2
  echo "Running Playwright test..."
  node test.js
}

# Run both tests
run_test node
echo ""
run_test dart
