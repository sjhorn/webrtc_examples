#!/bin/bash
# Run video_only test with either werift (Node.js) or webrtc_dart

set -e
cd "$(dirname "$0")"

SERVER=${1:-node}  # default to node, or pass "dart"

cleanup() {
  pkill -f "node server.js" 2>/dev/null || true
  pkill -f "dart.*server.dart" 2>/dev/null || true
}
trap cleanup EXIT

cleanup
sleep 1

if [ "$SERVER" = "dart" ]; then
  echo "=== Testing webrtc_dart (Dart) ==="
  dart run server.dart &
else
  echo "=== Testing werift (Node.js) ==="
  node server.js &
fi

sleep 3
echo "Running Playwright test..."
node test.js
