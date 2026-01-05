#!/bin/bash
cd "$(dirname "$0")"

SERVER_TYPE="${1:-node}"

# Kill any existing processes on ports 3000 and 8080
lsof -ti:3000,8080 | xargs kill -9 2>/dev/null
sleep 1

if [ "$SERVER_TYPE" = "dart" ]; then
  echo "Starting Dart server..."
  dart server.dart &
else
  echo "Starting Node server..."
  node server.js &
fi

SERVER_PID=$!
sleep 3

node test.js
TEST_EXIT=$?

kill $SERVER_PID 2>/dev/null
exit $TEST_EXIT
