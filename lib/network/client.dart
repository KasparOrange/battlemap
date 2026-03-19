import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import '../game_state.dart';

enum ClientConnectionState { disconnected, connecting, connected }

/// WebSocket client that runs on the phone in Companion Mode.
/// Sends commands to the TV server and receives state updates.
class BattlemapClient {
  final GameState gameState;
  final String host;
  final int port;

  WebSocket? _ws;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  DateTime? _lastPing;
  bool _intentionalClose = false;

  final _connectionController =
      StreamController<ClientConnectionState>.broadcast();
  Stream<ClientConnectionState> get connectionStream =>
      _connectionController.stream;

  ClientConnectionState _state = ClientConnectionState.disconnected;
  ClientConnectionState get state => _state;

  BattlemapClient({
    required this.gameState,
    required this.host,
    this.port = 8080,
  });

  Future<void> connect() async {
    _intentionalClose = false;
    _setState(ClientConnectionState.connecting);

    try {
      _ws = await WebSocket.connect('ws://$host:$port')
          .timeout(const Duration(seconds: 5));
      _setState(ClientConnectionState.connected);
      debugPrint('Connected to server at $host:$port');

      _startHeartbeatMonitor();

      _ws!.listen(
        (data) => _handleMessage(data as String),
        onDone: () {
          debugPrint('WebSocket closed');
          _onDisconnect();
        },
        onError: (e) {
          debugPrint('WebSocket error: $e');
          _onDisconnect();
        },
      );
    } catch (e) {
      debugPrint('Connection failed: $e');
      _setState(ClientConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  void _handleMessage(String data) {
    try {
      final msg = jsonDecode(data) as Map<String, dynamic>;
      final type = msg['type'] as String;

      switch (type) {
        case 'fullState':
          gameState.applyFullState(msg);
        case 'ping':
          _lastPing = DateTime.now();
          _send({'type': 'pong'});
      }
    } catch (e) {
      debugPrint('Error handling server message: $e');
    }
  }

  void _send(Map<String, dynamic> msg) {
    if (_ws != null && _ws!.readyState == WebSocket.open) {
      _ws!.add(jsonEncode(msg));
    }
  }

  // --- Command methods (called by CompanionScreen) ---

  void addToken(int gridX, int gridY) {
    _send({'type': 'addToken', 'gridX': gridX, 'gridY': gridY});
  }

  void moveToken(String id, int gridX, int gridY) {
    _send({'type': 'moveToken', 'id': id, 'gridX': gridX, 'gridY': gridY});
  }

  void removeToken(String id) {
    _send({'type': 'removeToken', 'id': id});
  }

  void addStroke(DrawStroke stroke) {
    _send({'type': 'addStroke', ...stroke.toJson()});
  }

  void clearDrawings() {
    _send({'type': 'clearDrawings'});
  }

  void sendStrokeUpdate(DrawStroke stroke) {
    _send({'type': 'strokeUpdate', ...stroke.toJson()});
  }

  void sendStrokeEnd() {
    _send({'type': 'strokeEnd'});
  }

  void sendPdf(Uint8List bytes) {
    _send({'type': 'loadPdf', 'data': base64Encode(bytes)});
  }

  void sendClearPdf() {
    _send({'type': 'clearPdf'});
  }

  // --- Connection management ---

  void _onDisconnect() {
    _ws = null;
    _heartbeatTimer?.cancel();
    if (!_intentionalClose) {
      _setState(ClientConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_intentionalClose) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      if (_state != ClientConnectionState.connected && !_intentionalClose) {
        debugPrint('Attempting reconnect to $host:$port...');
        connect();
      }
    });
  }

  void _startHeartbeatMonitor() {
    _lastPing = DateTime.now();
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_lastPing != null &&
          DateTime.now().difference(_lastPing!).inSeconds > 15) {
        debugPrint('Heartbeat timeout — disconnecting');
        _ws?.close();
        _onDisconnect();
      }
    });
  }

  void _setState(ClientConnectionState newState) {
    _state = newState;
    _connectionController.add(newState);
  }

  Future<void> disconnect() async {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    await _ws?.close();
    _ws = null;
    _setState(ClientConnectionState.disconnected);
  }

  void dispose() {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    _ws?.close();
    _connectionController.close();
  }
}
