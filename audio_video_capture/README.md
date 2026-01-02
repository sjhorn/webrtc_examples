# Audio/Video Capture Test

Tests WebRTC with getUserMedia to capture camera and microphone, display locally, and stream to a peer.

## What it tests

1. **getUserMedia** - Request camera and microphone access
2. **Local preview** - Display captured stream before sending
3. **addTrack** - Add audio and video tracks to peer connection
4. **Bidirectional streaming** - Both peers send and receive A/V
5. **ontrack** - Receive and display remote stream

## Test flow

```
Peer 1                              Peer 2
   |                                   |
   |-- getUserMedia (camera/mic) ----> |
   |-- display local video             |
   |                                   |-- getUserMedia (camera/mic)
   |                                   |-- display local video
   |                                   |
   |-- offer (with A/V tracks) ------->|
   |<-------- answer (with A/V) -------|
   |                                   |
   |<========= ICE candidates ========>|
   |                                   |
   |<== remote video/audio streams ===>|
```

## Playwright configuration

Uses fake media devices for automated testing:
```javascript
chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",      // Auto-accept permissions
    "--use-fake-device-for-media-stream",  // Use fake camera/mic
  ],
});
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
- `public/index.html` - Web UI with local/remote video elements
- `test.js` - Playwright automated test
- `run.sh` - Test runner script
