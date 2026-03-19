import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import '../game_state.dart';
import '../pdf_helper.dart';

/// WebSocket server that runs on the TV in Table Mode.
/// Accepts commands from companion clients and broadcasts state updates.
class BattlemapServer {
  final GameState gameState;
  final int port;

  HttpServer? _server;
  final List<WebSocket> _clients = [];
  String? _localIp;

  int get clientCount => _clients.length;
  String? get localIp => _localIp;
  bool get isRunning => _server != null;

  final _clientCountController = StreamController<int>.broadcast();
  Stream<int> get clientCountStream => _clientCountController.stream;

  final PdfHelper _pdfHelper = PdfHelper();

  BattlemapServer({required this.gameState, this.port = 8080});

  Future<void> start() async {
    _localIp = await _getLocalIp();
    _server = await HttpServer.bind(InternetAddress.anyIPv4, port);
    debugPrint('Battlemap server started on $_localIp:$port');

    gameState.addListener(_broadcastState);

    _server!.listen((HttpRequest request) {
      if (WebSocketTransformer.isUpgradeRequest(request)) {
        WebSocketTransformer.upgrade(request).then(_handleClient);
      } else {
        request.response
          ..statusCode = HttpStatus.ok
          ..write('Battlemap server running')
          ..close();
      }
    });
  }

  Future<void> stop() async {
    gameState.removeListener(_broadcastState);
    for (final client in _clients) {
      await client.close();
    }
    _clients.clear();
    await _server?.close();
    _server = null;
    _clientCountController.add(0);
  }

  void _handleClient(WebSocket ws) {
    _clients.add(ws);
    _clientCountController.add(_clients.length);
    debugPrint('Client connected (${_clients.length} total)');

    // Send current state immediately
    _sendTo(ws, jsonEncode({'type': 'fullState', ...gameState.toJson()}));

    ws.listen(
      (data) => _handleMessage(data as String),
      onDone: () {
        _clients.remove(ws);
        _clientCountController.add(_clients.length);
        debugPrint('Client disconnected (${_clients.length} total)');
      },
      onError: (e) {
        _clients.remove(ws);
        _clientCountController.add(_clients.length);
        debugPrint('Client error: $e');
      },
    );

    // Start heartbeat for this client
    _startHeartbeat(ws);
  }

  void _handleMessage(String data) {
    try {
      final msg = jsonDecode(data) as Map<String, dynamic>;
      final type = msg['type'] as String;

      switch (type) {
        case 'addToken':
          gameState.addToken(msg['gridX'] as int, msg['gridY'] as int);
        case 'moveToken':
          gameState.moveToken(
              msg['id'] as String, msg['gridX'] as int, msg['gridY'] as int);
        case 'removeToken':
          gameState.removeToken(msg['id'] as String);
        case 'addStroke':
          gameState.addStroke(DrawStroke.fromJson(msg));
        case 'clearDrawings':
          gameState.clearDrawings();
        case 'strokeUpdate':
          // Live stroke preview — set on game state, broadcast to other clients
          gameState.liveStroke = DrawStroke.fromJson(msg);
        case 'strokeEnd':
          gameState.liveStroke = null;
        case 'loadPdf':
          final bytes = base64Decode(msg['data'] as String);
          _pdfHelper.loadPdf(Uint8List.fromList(bytes), gameState);
        case 'clearPdf':
          _pdfHelper.clear(gameState);
        case 'pong':
          break; // heartbeat response
      }
    } catch (e) {
      debugPrint('Error handling message: $e');
    }
  }

  void _broadcastState() {
    final json = jsonEncode({'type': 'fullState', ...gameState.toJson()});
    _broadcast(json);
  }

  void _broadcast(String data) {
    final deadClients = <WebSocket>[];
    for (final client in _clients) {
      try {
        _sendTo(client, data);
      } catch (_) {
        deadClients.add(client);
      }
    }
    for (final dead in deadClients) {
      _clients.remove(dead);
    }
    if (deadClients.isNotEmpty) {
      _clientCountController.add(_clients.length);
    }
  }

  void _sendTo(WebSocket ws, String data) {
    if (ws.readyState == WebSocket.open) {
      ws.add(data);
    }
  }

  void _startHeartbeat(WebSocket ws) {
    Timer.periodic(const Duration(seconds: 5), (timer) {
      if (!_clients.contains(ws) || ws.readyState != WebSocket.open) {
        timer.cancel();
        return;
      }
      try {
        ws.add(jsonEncode({'type': 'ping'}));
      } catch (_) {
        timer.cancel();
        _clients.remove(ws);
        _clientCountController.add(_clients.length);
      }
    });
  }

  static Future<String?> _getLocalIp() async {
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
      );
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          if (!addr.isLoopback) return addr.address;
        }
      }
    } catch (e) {
      debugPrint('Could not get local IP: $e');
    }
    return null;
  }

  void dispose() {
    _clientCountController.close();
    stop();
  }
}
