# Audio Only Test

Tests WebRTC audio streaming from server to browser using pre-encoded μ-law audio.

## What it tests

1. **Server-to-browser streaming** - Sendonly audio track
2. **PCMU codec** - μ-law audio at 8kHz
3. **RTP packet timing** - 20ms intervals (160 samples)
4. **Replay support** - Stream restarts with new SSRC

## Audio format

- **Codec**: PCMU (μ-law, payload type 0)
- **Sample rate**: 8kHz
- **Channels**: Mono
- **Packet size**: 160 bytes (20ms)

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
- `audio.ulaw` - Pre-encoded μ-law audio from chrome.mp4
- `public/index.html` - Browser player UI
- `test.js` - Playwright automated test
- `run.sh` - Test runner script
