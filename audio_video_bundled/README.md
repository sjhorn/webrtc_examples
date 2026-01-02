# Audio + Video Bundled Test

Tests WebRTC audio and video streaming over a single bundled transport (BUNDLE).

## What it tests

1. **Bundled transport** - Audio and video share same ICE/DTLS connection
2. **Multi-track streaming** - Simultaneous audio and video
3. **PCMU + VP8 codecs** - Audio at 8kHz, video at 480x270
4. **Synchronized playback** - Both tracks in single MediaStream
5. **Replay support** - Both streams restart together

## Configuration

- **Bundle policy**: `max-bundle` (default)
- **Audio**: PCMU, 8kHz, 20ms packets
- **Video**: VP8, 480x270, ~30fps

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
