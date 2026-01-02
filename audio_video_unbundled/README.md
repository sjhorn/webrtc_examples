# Audio + Video Unbundled Test

Tests WebRTC audio and video streaming over separate transports (no BUNDLE).

## What it tests

1. **Unbundled transport** - Audio and video use separate ICE/DTLS connections
2. **Per-m-line ICE credentials** - Each media line has unique ice-ufrag/ice-pwd
3. **Independent transports** - Separate MediaTransport per track
4. **Multi-track streaming** - Simultaneous audio and video
5. **Replay support** - Both streams restart together

## Configuration

- **Bundle policy**: `disable` (Dart) / `max-compat` (Node.js)
- **Audio**: PCMU, 8kHz, own transport
- **Video**: VP8, 480x270, own transport

## SDP differences from bundled

```
# Bundled: same credentials, BUNDLE group
a=group:BUNDLE 0 1 2
a=ice-ufrag:abc123  (same for all m-lines)

# Unbundled: unique credentials per m-line, no BUNDLE group
m=audio ...
a=ice-ufrag:de81    (unique)
m=video ...
a=ice-ufrag:b0cd    (different)
```

## Usage

```bash
# Test with Node.js (werift)
./run.sh node

# Test with Dart (webrtc_dart)
./run.sh dart
```

## Files

- `server.js` - Node.js WebRTC server using werift
- `server.dart` - Dart WebRTC server using webrtc_dart
- `audio.ulaw` - Pre-encoded μ-law audio
- `video.rtp` - Pre-encoded VP8 RTP packets
- `public/index.html` - Browser player UI
- `test.js` - Playwright automated test
- `run.sh` - Test runner script
