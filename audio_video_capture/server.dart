import 'dart:convert';
import 'dart:io';

void main() async {
  final server = await HttpServer.bind(InternetAddress.anyIPv4, 3000);
  print('http://localhost:3000');

  // Simple signaling: forward messages between two connected peers
  final peers = <int, WebSocket>{};
  var peerCount = 0;

  await for (final request in server) {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      final socket = await WebSocketTransformer.upgrade(request);
      final peerId = ++peerCount;
      peers[peerId] = socket;
      print('Peer $peerId connected (total: ${peers.length})');

      // Send peer ID to the client
      socket.add(jsonEncode({'type': 'id', 'peerId': peerId}));

      socket.listen((data) {
        final msg = jsonDecode(data as String) as Map<String, dynamic>;
        print('Peer $peerId sent: ${msg['type']}');

        // Forward to the other peer
        for (final entry in peers.entries) {
          if (entry.key != peerId && entry.value.readyState == WebSocket.open) {
            entry.value.add(jsonEncode({...msg, 'from': peerId}));
          }
        }
      }, onDone: () {
        peers.remove(peerId);
        print('Peer $peerId disconnected (total: ${peers.length})');
      });
    } else {
      await serveStatic(request);
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
