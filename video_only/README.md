# Video Only Test

Tests WebRTC video streaming from server to browser using pre-encoded VP8 RTP packets.

## What it tests

1. **Server-to-browser streaming** - Sendonly video track
2. **VP8 codec** - Video at 480x270
3. **RTP packet replay** - Pre-captured packets with normalized timestamps
4. **Replay support** - Stream restarts with new SSRC

## Video format

- **Codec**: VP8 (payload type 96)
- **Resolution**: 480x270
- **Frame rate**: ~30fps
- **Duration**: ~6 seconds

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
- `video.rtp` - Pre-encoded VP8 RTP packets from chrome.mp4
- `public/index.html` - Browser player UI
- `test.js` - Playwright automated test
- `run.sh` - Test runner script
