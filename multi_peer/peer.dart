import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:webrtc_dart/webrtc_dart.dart';
import 'package:webrtc_dart/src/nonstandard/media/track.dart' as nonstandard;

void main(List<String> args) async {
  final audioFile = args.isNotEmpty ? args[0] : 'peer0.wav';

  print('Peer starting with audio file: $audioFile');

  // Check if audio file exists
  final wavFile = File(audioFile);
  if (!await wavFile.exists()) {
    print('Error: Audio file not found: $audioFile');
    exit(1);
  }

  final wavBytes = await wavFile.readAsBytes();
  final audioDataLength = wavBytes.length - 44; // Subtract WAV header
  print('Audio file size: ${wavBytes.length} bytes (audio data: $audioDataLength bytes)');

  // Connect to signaling server
  final ws = await WebSocket.connect('ws://localhost:3000');
  print('Connected to signaling server');

  int? myPeerId;
  RTCPeerConnection? pc;
  RTCDataChannel? dataChannel;
  Process? ffmpegProcess;
  RawDatagramSocket? udpSocket;
  StreamSubscription? udpSub;
  var rtpPacketCount = 0;

  Future<void> startConnection() async {
    // Bind UDP socket first to get port
    udpSocket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    final udpPort = udpSocket!.port;
    print('UDP listening on port $udpPort');

    // Create PeerConnection with Opus codec
    pc = RTCPeerConnection(
      RtcConfiguration(
        iceServers: [
          IceServer(urls: ['stun:stun.l.google.com:19302']),
        ],
        codecs: RtcCodecs(
          audio: [
            RtpCodecParameters(
              mimeType: 'audio/opus',
              clockRate: 48000,
              channels: 2,
              payloadType: 111,
            ),
          ],
          video: [],
        ),
      ),
    );

    // Create audio track
    final audioTrack = nonstandard.MediaStreamTrack(kind: nonstandard.MediaKind.audio);

    // Forward RTP packets from ffmpeg UDP to WebRTC track
    var totalBytesSent = 0;
    udpSub = udpSocket!.listen((event) {
      if (event == RawSocketEvent.read) {
        final datagram = udpSocket!.receive();
        if (datagram != null) {
          audioTrack.writeRtp(datagram.data);
          rtpPacketCount++;
          totalBytesSent += datagram.data.length;
          if (rtpPacketCount % 100 == 0) {
            print('Sent $rtpPacketCount RTP packets ($totalBytesSent bytes)');
          }
        }
      }
    });

    // Add sendonly transceiver with audio track
    pc!.addTransceiver(audioTrack, direction: RtpTransceiverDirection.sendonly);
    print('Added sendonly audio transceiver');

    // Create DataChannel
    dataChannel = pc!.createDataChannel('messages');
    print('Created DataChannel');

    dataChannel!.onStateChange.listen((state) {
      print('DataChannel state: $state');
    });

    dataChannel!.onMessage.listen((message) {
      print('DataChannel message: $message');
      final msg = jsonDecode(message);
      if (msg['type'] == 'bytes-received') {
        print('\n=== RESULT ===');
        print('Peer $myPeerId ($audioFile)');
        print('Audio data sent: $audioDataLength bytes');
        print('RTP packets sent: $rtpPacketCount');
        print('Bytes received by browser: ${msg['bytes']}');
        print('==============\n');

        // Cleanup and exit
        Future.delayed(Duration(seconds: 1), () async {
          ffmpegProcess?.kill();
          udpSub?.cancel();
          udpSocket?.close();
          await pc?.close();
          ws.close();
          exit(0);
        });
      }
    });

    // Track connection state
    pc!.onConnectionStateChange.listen((state) async {
      print('Connection state: $state');

      if (state == PeerConnectionState.connected && ffmpegProcess == null) {
        print('Starting ffmpeg audio encoding...');
        ffmpegProcess = await startFfmpeg(audioFile, udpPort, audioDataLength, dataChannel!, myPeerId!, rtpPacketCount);
      }
    });

    pc!.onIceCandidate.listen((candidate) {
      ws.add(jsonEncode({
        'type': 'candidate',
        'target': 'receiver',
        'candidate': {
          'candidate': candidate.toSdp(),
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        },
      }));
    });

    // Create and send offer
    final offer = await pc!.createOffer();
    await pc!.setLocalDescription(offer);
    print('Created offer');

    ws.add(jsonEncode({
      'type': 'offer',
      'target': 'receiver',
      'sdp': {'type': offer.type, 'sdp': offer.sdp},
    }));
    print('Sent offer to receiver');
  }

  // Register as peer
  ws.add(jsonEncode({'type': 'register', 'role': 'peer', 'audioFile': audioFile}));

  ws.listen((data) async {
    final msg = jsonDecode(data as String) as Map<String, dynamic>;

    if (msg['type'] == 'id') {
      myPeerId = msg['peerId'] as int;
      print('Assigned peer ID: $myPeerId');
      await startConnection();
      return;
    }

    if (msg['type'] == 'answer') {
      print('Received answer from receiver');
      await pc!.setRemoteDescription(
        RTCSessionDescription(type: 'answer', sdp: msg['sdp']['sdp'] as String),
      );
      return;
    }

    if (msg['type'] == 'candidate') {
      if (msg['candidate'] != null) {
        final c = msg['candidate'] as Map<String, dynamic>;
        final candidateStr = c['candidate'] as String?;
        if (candidateStr != null && candidateStr.isNotEmpty) {
          final candidate = RTCIceCandidate.fromSdp(candidateStr);
          await pc!.addIceCandidate(candidate);
        }
      }
      return;
    }
  }, onDone: () {
    print('Disconnected from signaling server');
  });
}

Future<Process?> startFfmpeg(String audioFile, int udpPort, int audioDataLength,
    RTCDataChannel dataChannel, int peerId, int rtpPacketCount) async {
  // ffmpeg pipeline to encode WAV to Opus RTP
  final args = [
    '-re', // Read input at native frame rate
    '-i', audioFile,
    '-acodec', 'libopus',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '64k',
    '-f', 'rtp',
    'rtp://127.0.0.1:$udpPort',
  ];

  try {
    final process = await Process.start('ffmpeg', args);
    print('ffmpeg started');

    // Log ffmpeg output
    process.stderr.transform(utf8.decoder).listen((line) {
      // Only show important lines
      if (line.contains('Error') || line.contains('error')) {
        print('[ffmpeg] $line');
      }
    });

    // When ffmpeg finishes (audio complete), notify via DataChannel
    process.exitCode.then((code) {
      print('ffmpeg finished with code $code');

      // Send audio-complete message
      if (dataChannel.readyState == DataChannelState.open) {
        dataChannel.sendString(jsonEncode({
          'type': 'audio-complete',
          'peerId': peerId,
          'totalBytes': audioDataLength,
          'packets': rtpPacketCount,
        }));
        print('Sent audio-complete message');
      }
    });

    return process;
  } catch (e) {
    print('Failed to start ffmpeg: $e');
    print('Make sure ffmpeg is installed: brew install ffmpeg');
    return null;
  }
}
