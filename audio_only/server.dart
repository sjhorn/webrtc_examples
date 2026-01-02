import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:webrtc_dart/webrtc_dart.dart';
import 'package:webrtc_dart/src/nonstandard/media/track.dart' as nonstandard;

void main() async {
  // Load pre-encoded μ-law file
  final ulaw = File('audio.ulaw').readAsBytesSync();
  final packets = <Uint8List>[];
  for (var i = 0; i < ulaw.length; i += 160) {
    packets.add(Uint8List.fromList(ulaw.sublist(i, min(i + 160, ulaw.length))));
  }
  final duration = (packets.length * 20) / 1000;
  print('Loaded ${packets.length} packets (${duration}s)');

  // Start HTTP server
  final server = await HttpServer.bind(InternetAddress.anyIPv4, 3000);
  print('http://localhost:3000');

  await for (final request in server) {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      handleWebSocket(request, packets, duration);
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
      ext == 'html' ? 'text' : 'application',
      ext == 'html' ? 'html' : ext,
    );
    await request.response.addStream(file.openRead());
  } else {
    request.response.statusCode = 404;
  }
  await request.response.close();
}

Future<void> handleWebSocket(HttpRequest request, List<Uint8List> packets, double duration) async {
  final socket = await WebSocketTransformer.upgrade(request);
  final random = Random();

  final pc = RTCPeerConnection(RtcConfiguration(
    iceServers: [],
    codecs: RtcCodecs(audio: [createPcmuCodec()]),
  ));
  final track = nonstandard.MediaStreamTrack(kind: nonstandard.MediaKind.audio);
  pc.addTransceiver(track, direction: RtpTransceiverDirection.sendonly);

  var connected = false;
  Timer? interval;
  var seq = 0, ts = 0, idx = 0, ssrc = random.nextInt(0xffffffff);

  pc.onConnectionStateChange.listen((state) {
    if (state == PeerConnectionState.connected) connected = true;
  });

  void start() {
    if (!connected || interval != null) return;
    if (idx == 0) {
      track.notifySourceChanged(nonstandard.RtpHeaderInfo(
        sequenceNumber: 0, timestamp: 0, ssrc: ssrc, payloadType: 0, marker: true,
      ));
    }
    socket.add(jsonEncode({'type': 'started', 'duration': duration}));
    interval = Timer.periodic(Duration(milliseconds: 20), (_) {
      if (idx >= packets.length) {
        interval?.cancel();
        interval = null;
        idx = 0; seq = 0; ts = 0; ssrc = random.nextInt(0xffffffff);
        Future.delayed(Duration(milliseconds: 500), () {
          socket.add(jsonEncode({'type': 'ended'}));
        });
        return;
      }
      track.writeRtp(RtpPacket(
        payloadType: 0,
        sequenceNumber: seq++ % 65536,
        timestamp: ts,
        ssrc: ssrc,
        marker: idx == 0,
        payload: packets[idx++],
      ));
      ts += 160;
    });
  }

  void stop() {
    interval?.cancel();
    interval = null;
  }

  final offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.add(jsonEncode({'type': offer.type, 'sdp': offer.sdp}));

  socket.listen((data) async {
    final msg = jsonDecode(data as String) as Map<String, dynamic>;
    if (msg['type'] == 'answer') {
      await pc.setRemoteDescription(RTCSessionDescription(type: 'answer', sdp: msg['sdp'] as String));
    } else if (msg['type'] == 'play') {
      start();
    } else if (msg['type'] == 'pause') {
      stop();
    }
  }, onDone: () async {
    stop();
    await pc.close();
  });
}
