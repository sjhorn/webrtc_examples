/// WebRTC Audio STT Server (Dart)
/// Equivalent to server.js using webrtc_dart
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:webrtc_dart/webrtc_dart.dart';

// Whisper server configuration
final whisperServerUrl = Platform.environment['WHISPER_URL'] ??
    'http://127.0.0.1:8178/v1/audio/transcriptions';

var clientIdCounter = 0;

/// OGG Opus Writer - Creates proper Ogg container for Opus packets
/// This allows FFmpeg to decode the audio correctly
class OggOpusWriter {
  final int sampleRate;
  final int channels;
  int _granulePosition = 0;
  int _pageSequence = 0;
  final int _serialNumber = DateTime.now().millisecondsSinceEpoch & 0xFFFFFFFF;

  OggOpusWriter({this.sampleRate = 48000, this.channels = 1});

  /// Build complete Ogg Opus file from packets
  Uint8List build(List<Uint8List> opusPackets) {
    final pages = <Uint8List>[];

    // Page 1: OpusHead (ID header)
    pages.add(_buildPage(_createOpusHead(), 0, isFirst: true));

    // Page 2: OpusTags (comment header)
    pages.add(_buildPage(_createOpusTags(), 0));

    // Audio pages - one packet per page for simplicity
    for (final packet in opusPackets) {
      // Each Opus packet is 20ms = 960 samples at 48kHz
      _granulePosition += 960;
      pages.add(_buildPage(packet, _granulePosition));
    }

    // Mark last page as end of stream
    if (pages.length > 2) {
      final lastPage = pages.last;
      lastPage[5] |= 0x04; // EOS flag
    }

    // Concatenate all pages
    return Uint8List.fromList(pages.expand((p) => p).toList());
  }

  /// Create OpusHead identification header
  Uint8List _createOpusHead() {
    final head = Uint8List(19);
    final view = ByteData.sublistView(head);

    // Magic "OpusHead"
    head.setRange(0, 8, 'OpusHead'.codeUnits);
    head[8] = 1; // Version
    head[9] = channels; // Channel count
    view.setUint16(10, 312, Endian.little); // Pre-skip
    view.setUint32(12, sampleRate, Endian.little); // Sample rate
    view.setUint16(16, 0, Endian.little); // Output gain
    head[18] = 0; // Channel mapping family

    return head;
  }

  /// Create OpusTags comment header
  Uint8List _createOpusTags() {
    const vendor = 'stream_stt';
    final vendorBytes = vendor.codeUnits;
    final tags = Uint8List(8 + 4 + vendorBytes.length + 4);
    final view = ByteData.sublistView(tags);

    // Magic "OpusTags"
    tags.setRange(0, 8, 'OpusTags'.codeUnits);
    // Vendor string length
    view.setUint32(8, vendorBytes.length, Endian.little);
    // Vendor string
    tags.setRange(12, 12 + vendorBytes.length, vendorBytes);
    // User comment list length (0)
    view.setUint32(12 + vendorBytes.length, 0, Endian.little);

    return tags;
  }

  /// Build an Ogg page with proper header
  Uint8List _buildPage(Uint8List data, int granule, {bool isFirst = false}) {
    // Calculate segments
    final segments = <int>[];
    var remaining = data.length;
    while (remaining >= 255) {
      segments.add(255);
      remaining -= 255;
    }
    segments.add(remaining);

    // Page header (27 bytes) + segment table + data
    final pageSize = 27 + segments.length + data.length;
    final page = Uint8List(pageSize);
    final view = ByteData.sublistView(page);

    // OggS magic
    page.setRange(0, 4, 'OggS'.codeUnits);
    page[4] = 0; // Version
    page[5] = isFirst ? 0x02 : 0x00; // Header type (BOS for first)
    view.setInt64(6, granule, Endian.little); // Granule position
    view.setUint32(14, _serialNumber, Endian.little); // Serial number
    view.setUint32(18, _pageSequence++, Endian.little); // Page sequence
    view.setUint32(22, 0, Endian.little); // CRC (will calculate)
    page[26] = segments.length; // Number of segments

    // Segment table
    for (var i = 0; i < segments.length; i++) {
      page[27 + i] = segments[i];
    }

    // Data
    page.setRange(27 + segments.length, pageSize, data);

    // Calculate CRC32
    final crc = _crc32(page);
    view.setUint32(22, crc, Endian.little);

    return page;
  }

  /// CRC32 lookup table for Ogg (polynomial 0x04C11DB7)
  static final _crcTable = _buildCrcTable();

  static List<int> _buildCrcTable() {
    final table = List<int>.filled(256, 0);
    for (var i = 0; i < 256; i++) {
      var r = i << 24;
      for (var j = 0; j < 8; j++) {
        if ((r & 0x80000000) != 0) {
          r = ((r << 1) ^ 0x04C11DB7) & 0xFFFFFFFF;
        } else {
          r = (r << 1) & 0xFFFFFFFF;
        }
      }
      table[i] = r;
    }
    return table;
  }

  int _crc32(Uint8List data) {
    var crc = 0;
    // CRC field at bytes 22-25 is already zero, so include all bytes
    for (var i = 0; i < data.length; i++) {
      crc = ((crc << 8) ^ _crcTable[((crc >> 24) & 0xFF) ^ data[i]]) & 0xFFFFFFFF;
    }
    return crc;
  }
}

// Convert Opus packets to WAV using FFmpeg
Future<Uint8List> opusToWav(List<Uint8List> opusPackets) async {
  final tempDir = Directory.systemTemp;
  final ts = DateTime.now().millisecondsSinceEpoch;
  final inputFile = File('${tempDir.path}/opus_$ts.ogg');
  final outputFile = File('${tempDir.path}/pcm_$ts.wav');

  try {
    // Create proper Ogg Opus container
    final writer = OggOpusWriter(sampleRate: 48000, channels: 1);
    final oggData = writer.build(opusPackets);
    await inputFile.writeAsBytes(oggData);

    // Use FFmpeg to decode Ogg Opus to WAV (16kHz mono)
    final result = await Process.run('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputFile.path,
      '-ar', '16000',
      '-ac', '1',
      '-y',
      outputFile.path,
    ]);

    if (result.exitCode != 0) {
      throw Exception('FFmpeg error: ${result.stderr}');
    }

    final wavData = await outputFile.readAsBytes();
    return wavData;
  } finally {
    // Cleanup temp files
    if (await inputFile.exists()) await inputFile.delete();
    if (await outputFile.exists()) await outputFile.delete();
  }
}

// Send audio to whisper-server and get transcription
Future<String> transcribeAudio(Uint8List wavData, {int timeoutMs = 30000}) async {
  final client = HttpClient();
  client.connectionTimeout = Duration(milliseconds: timeoutMs);

  try {
    final boundary = '----FormBoundary${DateTime.now().millisecondsSinceEpoch}';
    final request = await client.postUrl(Uri.parse(whisperServerUrl));

    request.headers.contentType =
        ContentType('multipart', 'form-data', parameters: {'boundary': boundary});

    final body = <int>[
      ...'--$boundary\r\n'.codeUnits,
      ...'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n'.codeUnits,
      ...'Content-Type: audio/wav\r\n\r\n'.codeUnits,
      ...wavData,
      ...'\r\n--$boundary\r\n'.codeUnits,
      ...'Content-Disposition: form-data; name="model"\r\n\r\n'.codeUnits,
      ...'whisper-1'.codeUnits,
      ...'\r\n--$boundary--\r\n'.codeUnits,
    ];

    request.add(body);
    final response = await request.close().timeout(Duration(milliseconds: timeoutMs));

    if (response.statusCode != 200) {
      throw Exception('Whisper error: ${response.statusCode}');
    }

    final responseBody = await response.transform(utf8.decoder).join();
    final result = jsonDecode(responseBody) as Map<String, dynamic>;
    return (result['text'] as String?)?.trim() ?? '';
  } finally {
    client.close();
  }
}

// Whisper STT - manages audio buffering and transcription
class WhisperSTT {
  final int clientId;
  final List<Uint8List> opusChunks = [];      // Current buffer for streaming
  final List<Uint8List> allOpusChunks = [];   // Keep all for final
  int packetCount = 0;
  String accumulatedTranscript = '';
  bool pendingTranscription = false;

  WhisperSTT(this.clientId);

  void addOpusPacket(Uint8List opusData) {
    opusChunks.add(Uint8List.fromList(opusData));
    allOpusChunks.add(Uint8List.fromList(opusData));
    packetCount++;
  }

  bool shouldTranscribe() {
    // ~75 packets = 1.5 seconds at 20ms per packet
    return packetCount >= 75 && !pendingTranscription;
  }

  Future<({String text, bool isNew})> transcribe() async {
    if (opusChunks.isEmpty) return (text: '', isNew: false);

    final chunks = List<Uint8List>.from(opusChunks);
    opusChunks.clear();
    packetCount = 0;
    pendingTranscription = true;

    try {
      final wavData = await opusToWav(chunks);
      final text = await transcribeAudio(wavData);
      pendingTranscription = false;

      if (text.isNotEmpty && !text.contains('[BLANK_AUDIO]')) {
        accumulatedTranscript = accumulatedTranscript.isEmpty
            ? text
            : '$accumulatedTranscript $text';
        return (text: accumulatedTranscript, isNew: true);
      }
      return (text: accumulatedTranscript.isEmpty ? '...' : accumulatedTranscript, isNew: false);
    } catch (e) {
      pendingTranscription = false;
      print('Client $clientId error: $e');
      return (text: accumulatedTranscript.isEmpty ? '[Error]' : accumulatedTranscript, isNew: false);
    }
  }

  Future<String> finalize() async {
    if (allOpusChunks.isEmpty) return '[No speech]';

    try {
      final wavData = await opusToWav(allOpusChunks);
      final text = await transcribeAudio(wavData, timeoutMs: 60000);
      return text.isEmpty ? '[No speech]' : text;
    } catch (e) {
      print('Client $clientId finalize error: $e');
      return accumulatedTranscript.isEmpty ? '[Error]' : accumulatedTranscript;
    }
  }
}

// HTTP server for static files
Future<HttpServer> startHttpServer(int port) async {
  final server = await HttpServer.bind(InternetAddress.anyIPv4, port);
  print('HTTP server running on http://localhost:$port');

  server.listen((request) async {
    final path = request.uri.path;

    if (path == '/' || path == '/index.html') {
      final file = File('index.html');
      if (await file.exists()) {
        request.response.headers.contentType = ContentType.html;
        await request.response.addStream(file.openRead());
      } else {
        request.response.statusCode = HttpStatus.notFound;
      }
    } else if (path.startsWith('/assets/')) {
      final file = File(path.substring(1));
      if (await file.exists()) {
        request.response.headers.contentType = ContentType('audio', 'wav');
        await request.response.addStream(file.openRead());
      } else {
        request.response.statusCode = HttpStatus.notFound;
      }
    } else {
      request.response.statusCode = HttpStatus.notFound;
    }
    await request.response.close();
  });

  return server;
}

// WebSocket signaling server
Future<HttpServer> startSignalingServer(int port) async {
  final server = await HttpServer.bind(InternetAddress.anyIPv4, port);
  print('WebSocket signaling server running on ws://localhost:$port');

  server.listen((request) async {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      final socket = await WebSocketTransformer.upgrade(request);
      handleClient(socket);
    } else {
      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
    }
  });

  return server;
}

void handleClient(WebSocket socket) {
  final clientId = clientIdCounter++;
  print('Client $clientId connected');

  RTCPeerConnection? pc;
  RTCDataChannel? dc;  // Data channel for transcriptions
  WhisperSTT? stt;
  StreamSubscription? rtpSubscription;

  socket.listen(
    (data) async {
      try {
        final msg = jsonDecode(data as String) as Map<String, dynamic>;
        final type = msg['type'] as String;
        print('Client $clientId sent: $type');

        switch (type) {
          case 'offer':
            pc = RTCPeerConnection(
              RtcConfiguration(iceServers: [
                IceServer(urls: ['stun:stun.l.google.com:19302']),
              ]),
            );
            stt = WhisperSTT(clientId);

            // Receive data channel from browser for sending transcriptions
            pc!.onDataChannel.listen((channel) {
              dc = channel;
              // Check if already open (may have opened before listener attached)
              if (dc!.readyState == DataChannelState.open) {
                print('Client $clientId: Data channel open');
              }
              dc!.onStateChange.listen((state) {
                if (state == DataChannelState.open) {
                  print('Client $clientId: Data channel open');
                }
              });
            });

            // Handle ICE candidates
            pc!.onIceCandidate.listen((candidate) {
              if (socket.readyState == WebSocket.open) {
                socket.add(jsonEncode({
                  'type': 'candidate',
                  'payload': {
                    'candidate': candidate.candidate,
                    'sdpMid': candidate.sdpMid,
                    'sdpMLineIndex': candidate.sdpMLineIndex,
                  },
                }));
              }
            });

            // Pre-create audio transceiver before receiving offer
            pc!.addTransceiver(
              MediaStreamTrackKind.audio,
              direction: RtpTransceiverDirection.recvonly,
            );

            // Set up track handler
            pc!.onTrack.listen((transceiver) {
              final track = transceiver.receiver.track;
              print('Client $clientId: Received track kind=${transceiver.kind}');

              if (transceiver.kind == MediaStreamTrackKind.audio) {
                rtpSubscription = track.onReceiveRtp.listen((rtp) async {
                  // Decode Opus to PCM and add to STT buffer
                  stt!.addOpusPacket(rtp.payload);

                  if (stt!.shouldTranscribe()) {
                    final result = await stt!.transcribe();
                    if (result.isNew && dc != null && dc!.readyState == DataChannelState.open) {
                      await dc!.send(jsonEncode({
                        'type': 'transcription',
                        'text': result.text,
                      }));
                    }
                  }
                });
              }
            });

            // Set remote description (offer from browser) - this triggers onTrack
            final payload = msg['payload'] as Map<String, dynamic>;
            await pc!.setRemoteDescription(
              RTCSessionDescription(type: 'offer', sdp: payload['sdp'] as String),
            );

            // Create and set answer
            final answer = await pc!.createAnswer();
            await pc!.setLocalDescription(answer);

            socket.add(jsonEncode({
              'type': 'answer',
              'payload': {'type': 'answer', 'sdp': answer.sdp},
            }));
            print('Client $clientId: Sent answer');

          case 'candidate':
            if (pc != null && msg['payload'] != null) {
              final payload = msg['payload'] as Map<String, dynamic>;
              final candidateStr = payload['candidate'] as String?;
              if (candidateStr != null && candidateStr.isNotEmpty) {
                // Parse ICE candidate from SDP string
                final candidate = RTCIceCandidate.fromSdp(candidateStr).copyWith(
                  sdpMid: payload['sdpMid'] as String?,
                  sdpMLineIndex: payload['sdpMLineIndex'] as int?,
                );
                await pc!.addIceCandidate(candidate);
                print('Client $clientId: Added ICE candidate');
              }
            }

          case 'done':
            if (stt != null) {
              final finalText = await stt!.finalize();
              if (dc != null && dc!.readyState == DataChannelState.open) {
                await dc!.send(jsonEncode({
                  'type': 'transcription',
                  'text': finalText,
                  'final': true,
                }));
              }
              print('Client $clientId: $finalText');
            }

          default:
            print('Client $clientId: Unknown message type: $type');
        }
      } catch (e) {
        print('Client $clientId error: $e');
      }
    },
    onDone: () {
      print('Client $clientId disconnected');
      rtpSubscription?.cancel();
      pc?.close();
    },
    onError: (e) {
      print('Client $clientId WebSocket error: $e');
    },
  );
}

void main() async {
  await startHttpServer(3000);
  await startSignalingServer(8080);
  print('Server ready. Open http://localhost:3000 in a browser.');
}
