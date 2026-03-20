import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import '../game/vtt_game.dart';
import '../state/vtt_state.dart';

/// WebSocket server for VTT table mode (runs on TV).
/// Accepts commands from companion phone and broadcasts state.
class VttServer {
  final VttState state;
  final VttGame game;
  final int port;

  HttpServer? _server;
  final List<WebSocket> _clients = [];
  String? _localIp;

  // Throttled broadcast
  bool _dirty = false;
  Timer? _broadcastTimer;

  int get clientCount => _clients.length;
  String? get localIp => _localIp;
  bool get isRunning => _server != null;

  final _clientCountController = StreamController<int>.broadcast();
  Stream<int> get clientCountStream => _clientCountController.stream;

  VttServer({required this.state, required this.game, this.port = 8080});

  Future<void> start() async {
    _localIp = await _getLocalIp();
    _server = await HttpServer.bind(InternetAddress.anyIPv4, port);
    debugPrint('VTT server started on $_localIp:$port');

    state.addListener(_onStateChanged);

    _server!.listen((HttpRequest request) {
      if (WebSocketTransformer.isUpgradeRequest(request)) {
        WebSocketTransformer.upgrade(request).then(_handleClient);
      } else {
        request.response
          ..statusCode = HttpStatus.ok
          ..write('VTT server running')
          ..close();
      }
    });
  }

  Future<void> stop() async {
    state.removeListener(_onStateChanged);
    _broadcastTimer?.cancel();
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
    debugPrint('VTT client connected (${_clients.length} total)');

    // Send map bytes if loaded
    if (state.rawMapBytes != null) {
      _sendTo(ws, jsonEncode({
        'type': 'vtt.mapLoaded',
        'data': base64Encode(state.rawMapBytes!),
      }));
    }

    // Send current state
    _sendFullState(ws);

    ws.listen(
      (data) => _handleMessage(data as String),
      onDone: () {
        _clients.remove(ws);
        _clientCountController.add(_clients.length);
        debugPrint('VTT client disconnected (${_clients.length} total)');
      },
      onError: (e) {
        _clients.remove(ws);
        _clientCountController.add(_clients.length);
        debugPrint('VTT client error: $e');
      },
    );

    _startHeartbeat(ws);
  }

  void _handleMessage(String data) {
    try {
      final msg = jsonDecode(data) as Map<String, dynamic>;
      final type = msg['type'] as String;

      switch (type) {
        case 'vtt.loadMap':
          final bytes = base64Decode(msg['data'] as String);
          state.loadMap(Uint8List.fromList(bytes));
          // Broadcast map to all clients
          _broadcast(jsonEncode({
            'type': 'vtt.mapLoaded',
            'data': msg['data'],
          }));
          game.zoomToFit();
        case 'vtt.clearMap':
          state.clearMap();
        case 'vtt.toggleReveal':
          state.toggleReveal(msg['index'] as int);
        case 'vtt.brushReveal':
          final indices = (msg['indices'] as List).cast<int>();
          state.applyBrushReveal(indices);
        case 'vtt.revealAll':
          if (state.map != null) {
            final total = state.map!.resolution.mapSize.dx.toInt() *
                state.map!.resolution.mapSize.dy.toInt();
            state.revealAll(total);
          }
        case 'vtt.hideAll':
          state.hideAll();
        case 'vtt.togglePortal':
          state.togglePortal(msg['index'] as int);
        case 'vtt.toggleGrid':
          state.toggleGrid();
        case 'vtt.toggleFog':
          state.toggleFog();
        case 'vtt.toggleWalls':
          state.toggleWalls();
        case 'vtt.setBrushRadius':
          state.setBrushRadius(msg['radius'] as int);
        case 'vtt.toggleRevealMode':
          state.toggleRevealMode();
        case 'vtt.zoomIn':
          game.zoomIn();
        case 'vtt.zoomOut':
          game.zoomOut();
        case 'vtt.zoomToFit':
          game.zoomToFit();
        case 'vtt.rotateCW':
          game.rotateCW();
        case 'vtt.rotateCCW':
          game.rotateCCW();
        case 'vtt.resetRotation':
          game.resetRotation();
        case 'vtt.calibrate':
          final screenWidth = MediaQueryData.fromView(
            WidgetsBinding.instance.platformDispatcher.views.first,
          ).size.width;
          state.calibrate(
            (msg['tvWidthInches'] as num).toDouble(),
            screenWidth,
          );
        case 'vtt.resetCalibration':
          state.resetCalibration();
        case 'pong':
          break;
      }
    } catch (e) {
      debugPrint('VTT server error handling message: $e');
    }
  }

  void _onStateChanged() {
    // Throttle broadcasts to max once per 50ms
    _dirty = true;
    _broadcastTimer ??= Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (_dirty) {
        _dirty = false;
        _broadcastFullState();
      }
    });
  }

  void _sendFullState(WebSocket ws) {
    final json = {
      'type': 'vtt.fullState',
      ...state.toJson(),
      'camera': game.getCameraState(),
    };
    _sendTo(ws, jsonEncode(json));
  }

  void _broadcastFullState() {
    final json = {
      'type': 'vtt.fullState',
      ...state.toJson(),
      'camera': game.getCameraState(),
    };
    _broadcast(jsonEncode(json));
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
    _broadcastTimer?.cancel();
    _clientCountController.close();
    stop();
  }
}
