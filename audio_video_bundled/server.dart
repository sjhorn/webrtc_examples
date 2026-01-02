import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:webrtc_dart/webrtc_dart.dart';
import 'package:webrtc_dart/src/nonstandard/media/track.dart' as nonstandard;

void main() async {
  // Load pre-encoded audio (μ-law)
  final ulaw = File('audio.ulaw').readAsBytesSync();
  final audioPackets = <Uint8List>[];
  for (var i = 0; i < ulaw.length; i += 160) {
    audioPackets.add(Uint8List.fromList(ulaw.sublist(i, min(i + 160, ulaw.length))));
  }
  final audioDuration = (audioPackets.length * 20) / 1000;

  // Load pre-encoded video (VP8 RTP)
  final videoData = File('video.rtp').readAsBytesSync();
  final videoPackets = <Uint8List>[];
  var offset = 0;
  while (offset < videoData.length) {
    final len = ByteData.sublistView(videoData, offset, offset + 4).getUint32(0);
    videoPackets.add(Uint8List.fromList(videoData.sublist(offset + 4, offset + 4 + len)));
    offset += 4 + len;
  }
  const videoDuration = 6.006;
  final videoBaseTs = RtpPacket.parse(videoPackets[0]).timestamp;

  final duration = min(audioDuration, videoDuration);
  print('Loaded audio: ${audioPackets.length} pkts, video: ${videoPackets.length} pkts (${duration.toStringAsFixed(2)}s)');

  final server = await HttpServer.bind(InternetAddress.anyIPv4, 3000);
  print('http://localhost:3000');

  await for (final request in server) {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      handleWebSocket(request, audioPackets, videoPackets, duration, videoBaseTs);
    } else {
      serveStatic(request);
    }
  }
}

Future<void> serveStatic(HttpRequest request) async {
  var path = request.uri.path == '/' ? '/index.html' : request.uri.path;
  final file = File('public$path');
  if (await file.exists()) {
    final ext = path.split('.').last;
    request.response.headers.contentType = ContentType(
      ext == 'html' ? 'text' : 'application', ext == 'html' ? 'html' : ext);
    await request.response.addStream(file.openRead());
  } else {
    request.response.statusCode = 404;
  }
  await request.response.close();
}

Future<void> handleWebSocket(HttpRequest request, List<Uint8List> audioPackets,
    List<Uint8List> videoPackets, double duration, int videoBaseTs) async {
  final socket = await WebSocketTransformer.upgrade(request);
  final random = Random();

  final pc = RTCPeerConnection(RtcConfiguration(
    iceServers: [],
    codecs: RtcCodecs(
      audio: [createPcmuCodec()],
      video: [createVp8Codec(payloadType: 96)],
    ),
  ));

  final audioTrack = nonstandard.MediaStreamTrack(kind: nonstandard.MediaKind.audio);
  final videoTrack = nonstandard.MediaStreamTrack(kind: nonstandard.MediaKind.video);
  pc.addTransceiver(audioTrack, direction: RtpTransceiverDirection.sendonly);
  pc.addTransceiver(videoTrack, direction: RtpTransceiverDirection.sendonly);

  var connected = false;
  Timer? audioTimer, videoTimer;
  var audioIdx = 0, audioSeq = 0, audioTs = 0, audioSsrc = random.nextInt(0xffffffff);
  var videoIdx = 0, videoSeq = 0, videoSsrc = random.nextInt(0xffffffff);
  var endedSent = false;

  pc.onConnectionStateChange.listen((s) { if (s == PeerConnectionState.connected) connected = true; });

  void checkEnded() {
    if (audioTimer == null && videoTimer == null && !endedSent) {
      endedSent = true;
      Future.delayed(Duration(milliseconds: 500), () {
        socket.add(jsonEncode({'type': 'ended'}));
        endedSent = false;
      });
    }
  }

  void start() {
    if (!connected || audioTimer != null) return;

    // Audio: 20ms intervals
    if (audioIdx == 0) {
      audioTrack.notifySourceChanged(nonstandard.RtpHeaderInfo(
        sequenceNumber: 0, timestamp: 0, ssrc: audioSsrc, payloadType: 0, marker: true,
      ));
    }
    audioTimer = Timer.periodic(Duration(milliseconds: 20), (_) {
      if (audioIdx >= audioPackets.length) {
        audioTimer?.cancel(); audioTimer = null;
        audioIdx = 0; audioSeq = 0; audioTs = 0; audioSsrc = random.nextInt(0xffffffff);
        checkEnded();
        return;
      }
      audioTrack.writeRtp(RtpPacket(
        payloadType: 0, sequenceNumber: audioSeq++ % 65536, timestamp: audioTs,
        ssrc: audioSsrc, marker: audioIdx == 0, payload: audioPackets[audioIdx++],
      ));
      audioTs += 160;
    });

    // Video: evenly spaced over duration
    final videoInterval = (duration * 1000) ~/ videoPackets.length;
    if (videoIdx == 0) {
      videoTrack.notifySourceChanged(nonstandard.RtpHeaderInfo(
        sequenceNumber: 0, timestamp: 0, ssrc: videoSsrc, payloadType: 96, marker: true,
      ));
    }
    videoTimer = Timer.periodic(Duration(milliseconds: videoInterval), (_) {
      if (videoIdx >= videoPackets.length) {
        videoTimer?.cancel(); videoTimer = null;
        videoIdx = 0; videoSeq = 0; videoSsrc = random.nextInt(0xffffffff);
        checkEnded();
        return;
      }
      final rtp = RtpPacket.parse(videoPackets[videoIdx++]);
      videoTrack.writeRtp(RtpPacket(
        version: rtp.version, padding: rtp.padding, extension: rtp.extension, marker: rtp.marker,
        payloadType: 96, sequenceNumber: videoSeq++ % 65536,
        timestamp: (rtp.timestamp - videoBaseTs) & 0xffffffff,
        ssrc: videoSsrc, csrcs: rtp.csrcs, extensionHeader: rtp.extensionHeader, payload: rtp.payload,
      ));
    });

    socket.add(jsonEncode({'type': 'started', 'duration': duration}));
  }

  void stop() {
    audioTimer?.cancel(); audioTimer = null;
    videoTimer?.cancel(); videoTimer = null;
  }

  final offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.add(jsonEncode({'type': offer.type, 'sdp': offer.sdp}));

  socket.listen((data) async {
    final m = jsonDecode(data as String) as Map<String, dynamic>;
    if (m['type'] == 'answer') await pc.setRemoteDescription(RTCSessionDescription(type: 'answer', sdp: m['sdp'] as String));
    else if (m['type'] == 'play') start();
    else if (m['type'] == 'pause') stop();
  }, onDone: () async { stop(); await pc.close(); });
}
