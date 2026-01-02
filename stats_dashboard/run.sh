#!/bin/bash
cd "$(dirname "$0")"

if [ "$1" = "dart" ]; then
  echo "Starting Dart server..."
  dart server.dart &
else
  echo "Starting Node server..."
  node server.js &
fi

SERVER_PID=$!
sleep 1

echo "Running test..."
node test.js

kill $SERVER_PID 2>/dev/null
