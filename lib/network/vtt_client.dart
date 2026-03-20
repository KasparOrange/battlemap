import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import '../state/vtt_state.dart';

enum VttConnectionState { disconnected, connecting, connected }

/// WebSocket client for VTT companion mode (runs on phone).
/// Sends DM commands to the TV and receives state broadcasts.
class VttClient {
  final VttState state;
  final String host;
  final int port;

  /// Called when camera state is received from TV.
  void Function(double x, double y, double zoom, double angle)? onCameraSync;

  WebSocket? _ws;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  DateTime? _lastPing;
  bool _intentionalClose = false;

  final _connectionController =
      StreamController<VttConnectionState>.broadcast();
  Stream<VttConnectionState> get connectionStream =>
      _connectionController.stream;

  VttConnectionState _state = VttConnectionState.disconnected;
  VttConnectionState get connectionState => _state;

  VttClient({
    required this.state,
    required this.host,
    this.port = 8080,
  });

  Future<void> connect() async {
    _intentionalClose = false;
    _setState(VttConnectionState.connecting);

    try {
      _ws = await WebSocket.connect('ws://$host:$port')
          .timeout(const Duration(seconds: 5));
      _setState(VttConnectionState.connected);
      debugPrint('VTT connected to $host:$port');

      _startHeartbeatMonitor();

      _ws!.listen(
        (data) => _handleMessage(data as String),
        onDone: () => _onDisconnect(),
        onError: (e) {
          debugPrint('VTT WebSocket error: $e');
          _onDisconnect();
        },
      );
    } catch (e) {
      debugPrint('VTT connection failed: $e');
      _setState(VttConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  void _handleMessage(String data) {
    try {
      final msg = jsonDecode(data) as Map<String, dynamic>;
      final type = msg['type'] as String;

      switch (type) {
        case 'vtt.mapLoaded':
          final bytes = base64Decode(msg['data'] as String);
          state.loadMap(Uint8List.fromList(bytes));
        case 'vtt.fullState':
          state.applyRemoteState(msg);
          // Sync camera
          final cam = msg['camera'] as Map<String, dynamic>?;
          if (cam != null) {
            onCameraSync?.call(
              (cam['x'] as num).toDouble(),
              (cam['y'] as num).toDouble(),
              (cam['zoom'] as num).toDouble(),
              (cam['angle'] as num).toDouble(),
            );
          }
        case 'ping':
          _lastPing = DateTime.now();
          _send({'type': 'pong'});
      }
    } catch (e) {
      debugPrint('VTT client error: $e');
    }
  }

  void _send(Map<String, dynamic> msg) {
    if (_ws != null && _ws!.readyState == WebSocket.open) {
      _ws!.add(jsonEncode(msg));
    }
  }

  // --- Command methods ---

  void sendLoadMap(Uint8List bytes) {
    _send({'type': 'vtt.loadMap', 'data': base64Encode(bytes)});
  }

  void sendClearMap() => _send({'type': 'vtt.clearMap'});
  void sendToggleReveal(int index) =>
      _send({'type': 'vtt.toggleReveal', 'index': index});
  void sendBrushReveal(List<int> indices) =>
      _send({'type': 'vtt.brushReveal', 'indices': indices});
  void sendRevealAll() => _send({'type': 'vtt.revealAll'});
  void sendHideAll() => _send({'type': 'vtt.hideAll'});
  void sendTogglePortal(int index) =>
      _send({'type': 'vtt.togglePortal', 'index': index});
  void sendToggleGrid() => _send({'type': 'vtt.toggleGrid'});
  void sendToggleFog() => _send({'type': 'vtt.toggleFog'});
  void sendToggleWalls() => _send({'type': 'vtt.toggleWalls'});
  void sendSetBrushRadius(int radius) =>
      _send({'type': 'vtt.setBrushRadius', 'radius': radius});
  void sendToggleRevealMode() => _send({'type': 'vtt.toggleRevealMode'});
  void sendZoomIn() => _send({'type': 'vtt.zoomIn'});
  void sendZoomOut() => _send({'type': 'vtt.zoomOut'});
  void sendZoomToFit() => _send({'type': 'vtt.zoomToFit'});
  void sendRotateCW() => _send({'type': 'vtt.rotateCW'});
  void sendRotateCCW() => _send({'type': 'vtt.rotateCCW'});
  void sendResetRotation() => _send({'type': 'vtt.resetRotation'});
  void sendCalibrate(double tvWidthInches) =>
      _send({'type': 'vtt.calibrate', 'tvWidthInches': tvWidthInches});
  void sendResetCalibration() => _send({'type': 'vtt.resetCalibration'});

  // --- Connection management ---

  void _onDisconnect() {
    _ws = null;
    _heartbeatTimer?.cancel();
    if (!_intentionalClose) {
      _setState(VttConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_intentionalClose) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      if (_state != VttConnectionState.connected && !_intentionalClose) {
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
        debugPrint('VTT heartbeat timeout');
        _ws?.close();
        _onDisconnect();
      }
    });
  }

  void _setState(VttConnectionState newState) {
    _state = newState;
    _connectionController.add(newState);
  }

  void dispose() {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    _ws?.close();
    _connectionController.close();
  }
}
