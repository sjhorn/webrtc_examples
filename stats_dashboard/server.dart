import 'dart:convert';
import 'dart:io';

void main() async {
  final server = await HttpServer.bind(InternetAddress.anyIPv4, 3000);
  print('http://localhost:3000');

  final clients = <WebSocket>[];

  await for (final request in server) {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      final socket = await WebSocketTransformer.upgrade(request);
      clients.add(socket);
      print('Client connected (total: ${clients.length})');

      socket.listen((data) {
        final msg = jsonDecode(data as String);
        // Broadcast to other clients
        for (final client in clients) {
          if (client != socket && client.readyState == WebSocket.open) {
            client.add(jsonEncode(msg));
          }
        }
      }, onDone: () {
        clients.remove(socket);
        print('Client disconnected (total: ${clients.length})');
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
