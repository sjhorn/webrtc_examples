# Network Interruptions

Tests WebRTC connection state handling and recovery through 3 different failure scenarios while streaming video and DataChannel messages.

## What it tests

1. **Video pause/resume** - `track.enabled = false/true`
2. **ICE restart** - Network path refresh without disconnect
3. **Full disconnect/reconnect** - New RTCPeerConnection

## Test timeline

```
1. CONNECTED           - Video streaming, DataChannel messages flowing
2. FAILURE 1           - Video paused (track disabled)
   RECOVERY 1          - Video resumed (connection never dropped)
3. FAILURE 2           - ICE restart triggered
   RECOVERY 2          - ICE restart complete (connection stayed up)
4. FAILURE 3           - Connection closed abruptly
   (Peer 2 detects)    - disconnected state
   RECOVERY 3          - Full reconnect with new RTCPeerConnection
5. TEST COMPLETE       - Video + messages flowing again
```

## Failure scenarios

### 1. Video Pause (track.enabled)

Disables the video track without affecting the connection:

```javascript
localStream.getVideoTracks().forEach(t => t.enabled = false);
// Connection stays up, DataChannel continues
```

- Connection state: stays `connected`
- DataChannel: stays `open`
- Video: freezes on remote side

### 2. ICE Restart

Refreshes ICE candidates (simulates network path change):

```javascript
const offer = await pc.createOffer({ iceRestart: true });
await pc.setLocalDescription(offer);
// Send offer to remote peer
```

- Connection state: may briefly show `connecting`
- DataChannel: stays `open`
- Video: may briefly freeze

### 3. Full Disconnect/Reconnect

Closes connection and creates new RTCPeerConnection:

```javascript
pc.close();  // Triggers 'closed' state
// Remote peer detects 'disconnected' state

// Reconnect with new connection
pc = new RTCPeerConnection(config);
// ... setup tracks and DataChannel
```

- Connection state: `closed` -> `connecting` -> `connected`
- DataChannel: `closed` -> (new channel) -> `open`
- Failed sends during disconnect

## DataChannel behavior

| Scenario | DataChannel State | Messages |
|----------|------------------|----------|
| Video pause | `open` | Continue flowing |
| ICE restart | `open` | Continue flowing |
| Disconnect | `closed` | Sends fail |
| Reconnect | `open` (new) | Resume flowing |

## Connection states observed

```
Peer 1 (initiator):
  new -> connecting -> connected -> closed -> connecting -> connected

Peer 2 (receiver):
  new -> connecting -> connected -> disconnected -> connecting -> connected
```

## Message stats example

```
Messages sent: 64
Messages received: 64
Failed sends: 2 (during disconnect)
```

## Usage

```bash
./run.sh  # Runs both Node.js and Dart tests
```

## Files

- `server.js` / `server.dart` - Signaling servers
- `public/index.html` - UI with connection states and DataChannel stats
- `test.js` - Playwright test with 3 failure/recovery scenarios
- `run.sh` - Test runner
