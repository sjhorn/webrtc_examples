# Data Channel - Reliable (TCP-like)

Tests WebRTC DataChannel in reliable mode with ordered delivery, similar to TCP.

## What it tests

1. **Reliable delivery** - SCTP retransmits until message is delivered
2. **Ordered delivery** - Messages arrive in the order they were sent
3. **Text messages** - String data transfer
4. **Binary messages** - ArrayBuffer data transfer
5. **Bulk transfer** - 100 sequential messages to verify ordering

## Channel configuration

```javascript
pc.createDataChannel("reliable-channel", {
  ordered: true,       // Messages arrive in order (default)
  // No maxRetransmits = reliable delivery
});
```

## Key behaviors

- **Ordered**: Messages always arrive in the order sent
- **Reliable**: No message loss - SCTP handles retransmission
- **Latency**: May have higher latency due to retransmission waits
- **Use case**: Chat, file transfer, game state synchronization

## Test flow

```
Peer 1                              Peer 2
   |                                   |
   |-- createDataChannel (reliable) -->|
   |-- offer ------------------------->|
   |<--------- answer -----------------|
   |                                   |
   |== "Hello" (text) ================>|
   |== [1024 bytes] (binary) =========>|
   |== 100 numbered messages =========>| (all arrive in order)
```

## Usage

```bash
./run.sh  # Runs both Node.js and Dart tests
```

## Files

- `server.js` / `server.dart` - Signaling servers
- `public/index.html` - Web UI with send controls
- `test.js` - Playwright automated test
- `run.sh` - Test runner
