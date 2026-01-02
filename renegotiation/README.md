# Renegotiation

Tests WebRTC renegotiation by adding and removing tracks mid-call, plus `replaceTrack` for efficient video pause/resume.

## What it tests

1. **Video-only start** - Initial call with video track only (no audio)
2. **Add audio mid-call** - Adding audio track triggers renegotiation
3. **Add second audio** - Layering audio2.wav via WebRTC (mixed on receiver)
4. **Remove second audio** - Triggers renegotiation
5. **Video pause/resume** - Using `replaceTrack()` (no renegotiation needed)

## Test timeline

```
0-6s:   VIDEO only (no audio)
6-10s:  VIDEO + AUDIO
10-16s: VIDEO + AUDIO + AUDIO2 (layered/mixed)
16-22s: AUDIO only (video paused)
22-26s: VIDEO + AUDIO (video restored)
```

## Key techniques

### Renegotiation (offer/answer required)
Adding or removing tracks requires a new SDP exchange:

```javascript
// Adding a track triggers negotiationneeded
pc.addTrack(audioTrack, stream);

// Removing a track also triggers negotiationneeded
pc.removeTrack(sender);
```

### replaceTrack (no renegotiation)
Swapping media on an existing transceiver is seamless:

```javascript
// Pause video (null track)
videoSender.replaceTrack(null);

// Resume video (new track, same transceiver)
videoSender.replaceTrack(newVideoTrack);
```

## Audio mixing

The second audio track is added via `captureStream()` from an audio element:

```javascript
audio2Element.play();
const audio2Stream = audio2Element.captureStream();
const audio2Track = audio2Stream.getAudioTracks()[0];
pc.addTrack(audio2Track, audio2Stream);
```

WebRTC automatically mixes multiple audio tracks on the receiver side.

## Renegotiations: 4 total

1. Initial (video)
2. Add audio
3. Add audio2
4. Remove audio2

Video pause/resume uses `replaceTrack()` - no renegotiation needed.

## Usage

```bash
./run.sh  # Runs both Node.js and Dart tests
```

## Files

- `server.js` / `server.dart` - Signaling servers
- `public/index.html` - Web UI with status display
- `public/audio2.wav` - Second audio track for mixing
- `video.y4m` / `audio.wav` - Fake media from chrome.mp4
- `test.js` - Playwright automated test
- `run.sh` - Test runner
