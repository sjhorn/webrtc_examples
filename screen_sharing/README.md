# Screen Sharing Test

Tests WebRTC screen sharing using getDisplayMedia to capture and stream a screen or window to a peer.

## What it tests

1. **getDisplayMedia** - Request screen/window capture
2. **Local preview** - Display captured screen before sending
3. **One-way streaming** - Sharer sends, viewer receives
4. **Track handling** - Video track from screen capture
5. **System audio** - Optional audio capture (if available)

## Test flow

```
Peer 1 (Sharer)                     Peer 2 (Viewer)
   |                                      |
   |-- getDisplayMedia (screen) --------->|
   |-- display local preview              |
   |                                      |
   |-- offer (with video track) --------->|
   |<------------- answer ----------------|
   |                                      |
   |<========= ICE candidates ==========>|
   |                                      |
   |== screen video stream ==============>|
```

## Playwright configuration

Uses Chrome flags for automated screen capture:
```javascript
chromium.launch({
  args: [
    "--auto-select-desktop-capture-source=Entire screen",
    "--enable-usermedia-screen-capturing",
  ],
});
```

Note: getDisplayMedia has limited automation support. The test falls back to camera if screen capture fails.

## Usage

```bash
# Test with Node.js signaling server
./run.sh node

# Test with Dart signaling server
./run.sh dart
```

## Manual testing

For full screen sharing experience, open two browser tabs manually:
1. Open http://localhost:3000 in two tabs
2. Tab 1: Click "Share Screen" and select a window/screen
3. Tab 1: Click "Start Call"
4. Tab 2: Should see the shared screen

## Files

- `server.js` - Node.js signaling server
- `server.dart` - Dart signaling server
- `public/index.html` - Web UI with local/remote video elements
- `test.js` - Playwright automated test
- `run.sh` - Test runner script
