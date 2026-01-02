import 'dart:convert';
import 'dart:io';

void main() async {
  final server = await HttpServer.bind(InternetAddress.anyIPv4, 3000);
  print('http://localhost:3000');

  WebSocket? receiver;
  final peers = <int, WebSocket>{};
  var peerCount = 0;

  await for (final request in server) {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      final socket = await WebSocketTransformer.upgrade(request);
      int? clientId;
      var isReceiver = false;

      socket.listen((data) {
        final msg = jsonDecode(data as String) as Map<String, dynamic>;

        // Registration
        if (msg['type'] == 'register') {
          if (msg['role'] == 'receiver') {
            receiver = socket;
            isReceiver = true;
            print('Browser receiver connected');
            return;
          } else if (msg['role'] == 'peer') {
            clientId = ++peerCount;
            peers[clientId!] = socket;
            print('Peer $clientId connected (audio: ${msg['audioFile']})');

            // Send ID back to peer
            socket.add(jsonEncode({'type': 'id', 'peerId': clientId}));

            // Notify receiver about new peer
            if (receiver != null && receiver!.readyState == WebSocket.open) {
              receiver!.add(jsonEncode({'type': 'peer-joined', 'peerId': clientId}));
            }
            return;
          }
        }

        // Route signaling messages
        if (msg['target'] == 'receiver' && receiver != null && receiver!.readyState == WebSocket.open) {
          // Peer -> Receiver
          receiver!.add(jsonEncode({...msg, 'from': clientId}));
        } else if (msg['target'] != null && msg['target'] is int) {
          // Receiver -> Peer
          final targetPeer = peers[msg['target'] as int];
          if (targetPeer != null && targetPeer.readyState == WebSocket.open) {
            targetPeer.add(jsonEncode({...msg, 'from': 'receiver'}));
          }
        }
      }, onDone: () {
        if (isReceiver) {
          receiver = null;
          print('Browser receiver disconnected');
        } else if (clientId != null) {
          peers.remove(clientId);
          print('Peer $clientId disconnected');

          // Notify receiver
          if (receiver != null && receiver!.readyState == WebSocket.open) {
            receiver!.add(jsonEncode({'type': 'peer-left', 'peerId': clientId}));
          }
        }
      });
    } else {
      await serveStatic(request);
    }
  }
}

Future<void> serveStatic(HttpRequest request) async {
  var path = request.uri.path == '/' ? '/index.html' : request.uri.path;

  // Check for .wav files in root directory
  File file;
  if (path.endsWith('.wav')) {
    file = File(path.substring(1)); // Remove leading slash
  } else {
    file = File('public$path');
  }

  if (await file.exists()) {
    final ext = path.split('.').last;
    if (ext == 'wav') {
      request.response.headers.contentType = ContentType('audio', 'wav');
    } else {
      request.response.headers.contentType = ContentType(
        ext == 'html' ? 'text' : 'application', ext == 'html' ? 'html' : ext);
    }
    await request.response.addStream(file.openRead());
  } else {
    request.response.statusCode = 404;
  }
  await request.response.close();
}
