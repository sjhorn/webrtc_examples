# Speech to Text

Stream audio from multiple browser clients to server for real-time speech-to-text transcription using Whisper.

## What it tests

1. **Browser-to-server streaming** - Multiple clients sending audio via WebRTC
2. **Opus decoding** - Server decodes Opus audio to PCM
3. **Multi-peer connections** - 6 simultaneous peer connections
4. **DataChannel** - Transcription results sent back via data channels
5. **STT integration** - Audio streamed to Whisper for transcription

## Audio format

- **Input codec**: Opus (browser WebRTC default)
- **Decoded**: PCM 16-bit, 48kHz mono
- **Chunk size**: 20ms frames

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
- `assets/*.wav` - Pre-recorded audio files for testing
- `public/index.html` - Browser UI with 6 peer boxes
- `test.js` - Playwright automated test
- `run.sh` - Test runner script
