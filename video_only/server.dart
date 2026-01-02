import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:webrtc_dart/webrtc_dart.dart';
import 'package:webrtc_dart/src/nonstandard/media/track.dart' as nonstandard;

void main() async {
  // Load pre-encoded VP8 RTP packets
  final data = File('video.rtp').readAsBytesSync();
  final packets = <Uint8List>[];
  var offset = 0;
  while (offset < data.length) {
    final len = ByteData.sublistView(data, offset, offset + 4).getUint32(0);
    packets.add(Uint8List.fromList(data.sublist(offset + 4, offset + 4 + len)));
    offset += 4 + len;
  }
  const duration = 6.006;
  final interval = (duration * 1000) ~/ packets.length;
  print('Loaded ${packets.length} packets (${duration}s, ${interval}ms/pkt)');

  final server = await HttpServer.bind(InternetAddress.anyIPv4, 3000);
  print('http://localhost:3000');

  await for (final request in server) {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      handleWebSocket(request, packets, duration, interval);
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

Future<void> handleWebSocket(HttpRequest request, List<Uint8List> packets, double duration, int interval) async {
  final socket = await WebSocketTransformer.upgrade(request);

  final pc = RTCPeerConnection(RtcConfiguration(
    iceServers: [],
    codecs: RtcCodecs(video: [createVp8Codec(payloadType: 96)]),
  ));
  final track = nonstandard.MediaStreamTrack(kind: nonstandard.MediaKind.video);
  pc.addTransceiver(track, direction: RtpTransceiverDirection.sendonly);

  final random = Random();
  var connected = false;
  Timer? timer;
  var idx = 0, seq = 0, ssrc = random.nextInt(0xffffffff);
  final baseTs = RtpPacket.parse(packets[0]).timestamp;

  pc.onConnectionStateChange.listen((s) { if (s == PeerConnectionState.connected) connected = true; });

  void start() {
    if (!connected || timer != null) return;
    if (idx == 0) {
      track.notifySourceChanged(nonstandard.RtpHeaderInfo(
        sequenceNumber: 0, timestamp: 0, ssrc: ssrc, payloadType: 96, marker: true,
      ));
    }
    socket.add(jsonEncode({'type': 'started', 'duration': duration}));
    timer = Timer.periodic(Duration(milliseconds: interval), (_) {
      if (idx >= packets.length) {
        timer?.cancel(); timer = null;
        idx = 0; seq = 0; ssrc = random.nextInt(0xffffffff);
        Future.delayed(Duration(milliseconds: 500), () => socket.add(jsonEncode({'type': 'ended'})));
        return;
      }
      final rtp = RtpPacket.parse(packets[idx++]);
      track.writeRtp(RtpPacket(
        version: rtp.version, padding: rtp.padding, extension: rtp.extension, marker: rtp.marker,
        payloadType: 96, sequenceNumber: seq++ % 65536, timestamp: (rtp.timestamp - baseTs) & 0xffffffff,
        ssrc: ssrc, csrcs: rtp.csrcs, extensionHeader: rtp.extensionHeader, payload: rtp.payload,
      ));
    });
  }

  void stop() { timer?.cancel(); timer = null; }

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
