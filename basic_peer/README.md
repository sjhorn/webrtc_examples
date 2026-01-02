# Basic Peer Connection Test

Tests WebRTC peer-to-peer connection between two browser tabs using a simple signaling server.

## What it tests

1. **Signaling** - WebSocket-based message relay between two peers
2. **Offer/Answer exchange** - SDP negotiation
3. **ICE candidate exchange** - Trickle ICE
4. **Connection establishment** - ICE connected state
5. **DataChannel** - Bidirectional message passing

## Test flow

```
Peer 1                    Server                    Peer 2
   |--- WebSocket open ---->|<--- WebSocket open ----|
   |<---- id: 1 ------------|------- id: 2 --------->|
   |                        |                        |
   |--- offer ------------->|--- offer ------------->|
   |                        |<---- answer -----------|
   |<---- answer -----------|                        |
   |                        |                        |
   |--- candidate --------->|--- candidate --------->|
   |<---- candidate --------|<---- candidate --------|
   |                        |                        |
   |<========= ICE connected / DataChannel open =====>|
   |                        |                        |
   |<======== "Hello from peer X" (DataChannel) =====>|
```

## Usage

```bash
# Test with Node.js signaling server
./run.sh node

# Test with Dart signaling server
./run.sh dart
```

## Files

- `server.js` - Node.js signaling server
- `server.dart` - Dart signaling server
- `public/index.html` - Web UI for peer connection
- `test.js` - Playwright automated test
- `run.sh` - Test runner script
