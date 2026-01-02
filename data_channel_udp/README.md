# Data Channel - Unreliable (UDP-like)

Tests WebRTC DataChannel in unreliable mode without ordering guarantees, similar to UDP.

## What it tests

1. **Unreliable delivery** - No retransmissions (fire-and-forget)
2. **Unordered delivery** - Messages may arrive out of order
3. **Text messages** - String data transfer
4. **Binary messages** - ArrayBuffer data transfer
5. **Bulk transfer** - 100 messages to observe potential loss/reordering

## Channel configuration

```javascript
pc.createDataChannel("unreliable-channel", {
  ordered: false,      // Messages may arrive out of order
  maxRetransmits: 0,   // No retries - may lose messages
});
```

## Key behaviors

- **Unordered**: Messages may arrive in different order than sent
- **Unreliable**: Messages may be lost (no retransmission)
- **Low latency**: No waiting for retransmissions
- **Use case**: Real-time games, live video/audio, sensor data

## Comparison with TCP-like mode

| Feature | TCP-like (reliable) | UDP-like (unreliable) |
|---------|--------------------|-----------------------|
| ordered | true | false |
| maxRetransmits | unlimited | 0 |
| Message loss | Never | Possible |
| Latency | Higher | Lower |
| Use case | Chat, files | Games, streaming |

## Test flow

```
Peer 1                              Peer 2
   |                                   |
   |-- createDataChannel (unreliable)->|
   |-- offer ------------------------->|
   |<--------- answer -----------------|
   |                                   |
   |== "Hello" (text) ================>| (may arrive)
   |== [1024 bytes] (binary) =========>| (may arrive)
   |== 100 numbered messages =========>| (some may be lost/reordered)
```

## Note on localhost testing

On localhost, packet loss is rare even with unreliable channels. The channel is configured correctly for UDP-like behavior, but you'll typically see all messages delivered. Real packet loss would occur over actual networks with congestion.

## Usage

```bash
./run.sh  # Runs both Node.js and Dart tests
```

## Files

- `server.js` / `server.dart` - Signaling servers
- `public/index.html` - Web UI with send controls and stats
- `test.js` - Playwright automated test
- `run.sh` - Test runner
