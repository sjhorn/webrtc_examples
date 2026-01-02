#!/bin/bash
cd "$(dirname "$0")"

# Usage: ./run.sh [node|dart] [--dart-peers]
# Examples:
#   ./run.sh           # Node server, Node peers
#   ./run.sh dart      # Dart server, Node peers
#   ./run.sh --dart    # Node server, Dart peers
#   ./run.sh dart --dart # Dart server, Dart peers

SERVER_TYPE="${1:-node}"
PEER_FLAG=""

# Check for --dart flag for peers
if [[ "$1" == "--dart" ]] || [[ "$2" == "--dart" ]]; then
  PEER_FLAG="--dart"
  if [[ "$1" == "--dart" ]]; then
    SERVER_TYPE="node"
  fi
fi

if [ "$SERVER_TYPE" = "dart" ]; then
  echo "Starting Dart server..."
  dart server.dart &
else
  echo "Starting Node server..."
  node server.js &
fi

SERVER_PID=$!
sleep 1

echo "Running test with ${PEER_FLAG:-Node} peers..."
node test.js $PEER_FLAG

kill $SERVER_PID 2>/dev/null
