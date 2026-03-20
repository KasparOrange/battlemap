import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../game/vtt_game.dart';
import '../state/vtt_state.dart';
import 'dm_control_panel.dart';

// Conditional import for networking
import '../network/vtt_client_stub.dart'
    if (dart.library.io) '../network/vtt_client.dart';

/// VTT Companion — phone DM controller that connects to TV via WebSocket.
class VttCompanionScreen extends StatefulWidget {
  final String? serverHost;
  final int serverPort;

  const VttCompanionScreen({
    super.key,
    this.serverHost,
    this.serverPort = 8080,
  });

  @override
  State<VttCompanionScreen> createState() => _VttCompanionScreenState();
}

class _VttCompanionScreenState extends State<VttCompanionScreen> {
  final VttState _state = VttState();
  late final VttGame _game;

  VttClient? _client;
  VttConnectionState _connectionState = VttConnectionState.disconnected;
  StreamSubscription<VttConnectionState>? _connectionSub;

  bool get _isNetworked => widget.serverHost != null && !kIsWeb;

  @override
  void initState() {
    super.initState();
    _state.isInteractive = false; // phone doesn't handle fog touches directly
    _game = VttGame(state: _state);
    _state.addListener(_onStateChanged);
    if (_isNetworked) _connectToServer();
  }

  @override
  void dispose() {
    _state.removeListener(_onStateChanged);
    _connectionSub?.cancel();
    _client?.dispose();
    _state.dispose();
    super.dispose();
  }

  void _onStateChanged() => setState(() {});

  Future<void> _connectToServer() async {
    _client = VttClient(
      state: _state,
      host: widget.serverHost!,
      port: widget.serverPort,
    );
    _client!.onCameraSync = (x, y, zoom, angle) {
      _game.syncCamera(x, y, zoom, angle);
    };
    _connectionSub = _client!.connectionStream.listen((s) {
      setState(() => _connectionState = s);
    });
    await _client!.connect();
  }

  Future<void> _pickMap() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['dd2vtt', 'uvtt'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final bytes = result.files.first.bytes;
    if (bytes == null) return;

    if (_isNetworked) {
      _client?.sendLoadMap(bytes);
    } else {
      _state.loadMap(bytes);
    }
  }

  DmCallbacks _buildCallbacks() {
    if (_isNetworked && _client != null) {
      final c = _client!;
      return DmCallbacks(
        onLoadMap: _pickMap,
        onToggleFog: c.sendToggleFog,
        onRevealAll: c.sendRevealAll,
        onHideAll: c.sendHideAll,
        onToggleGrid: c.sendToggleGrid,
        onToggleWalls: c.sendToggleWalls,
        onToggleRevealMode: c.sendToggleRevealMode,
        onSetBrushRadius: c.sendSetBrushRadius,
        onZoomIn: c.sendZoomIn,
        onZoomOut: c.sendZoomOut,
        onZoomToFit: c.sendZoomToFit,
        onRotateCW: c.sendRotateCW,
        onRotateCCW: c.sendRotateCCW,
        onResetRotation: c.sendResetRotation,
        onCalibrate: c.sendCalibrate,
        onResetCalibration: c.sendResetCalibration,
      );
    }
    // Local mode fallback
    return DmCallbacks(
      onLoadMap: _pickMap,
      onToggleFog: _state.toggleFog,
      onRevealAll: () {
        if (_state.map != null) {
          final total = _state.map!.resolution.mapSize.dx.toInt() *
              _state.map!.resolution.mapSize.dy.toInt();
          _state.revealAll(total);
        }
      },
      onHideAll: _state.hideAll,
      onToggleGrid: _state.toggleGrid,
      onToggleWalls: _state.toggleWalls,
      onToggleRevealMode: _state.toggleRevealMode,
      onSetBrushRadius: _state.setBrushRadius,
      onZoomIn: _game.zoomIn,
      onZoomOut: _game.zoomOut,
      onZoomToFit: _game.zoomToFit,
      onRotateCW: _game.rotateCW,
      onRotateCCW: _game.rotateCCW,
      onResetRotation: _game.resetRotation,
      onCalibrate: (inches) {
        final screenWidth = MediaQuery.of(context).size.width;
        _state.calibrate(inches, screenWidth);
      },
      onResetCalibration: _state.resetCalibration,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Game preview (mirrors TV)
          GameWidget(game: _game),

          // Back button
          Positioned(
            top: 16,
            left: 16,
            child: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white54),
              onPressed: () => Navigator.pop(context),
            ),
          ),

          // Connection banner
          if (_isNetworked)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _buildConnectionBanner(),
            ),

          // DM Control Panel
          Positioned(
            bottom: 16,
            right: 16,
            child: DmControlPanel(
              state: _state,
              callbacks: _buildCallbacks(),
            ),
          ),

          // Map info
          if (_state.map != null)
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${_state.map!.resolution.mapSize.dx.toInt()}x'
                  '${_state.map!.resolution.mapSize.dy.toInt()} grid',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ),

          // Empty state
          if (_state.map == null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.map, color: Colors.white12, size: 64),
                  const SizedBox(height: 16),
                  Text(
                    _isNetworked
                        ? 'Connected — load a map from the DM panel'
                        : 'Tap the gear icon to load a .dd2vtt map',
                    style: const TextStyle(color: Colors.white24, fontSize: 16),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildConnectionBanner() {
    Color bgColor;
    String text;
    IconData icon;

    switch (_connectionState) {
      case VttConnectionState.connected:
        bgColor = Colors.green.shade800;
        text = 'Connected to ${widget.serverHost}';
        icon = Icons.wifi;
      case VttConnectionState.connecting:
        bgColor = Colors.orange.shade800;
        text = 'Connecting to ${widget.serverHost}...';
        icon = Icons.wifi_find;
      case VttConnectionState.disconnected:
        bgColor = Colors.red.shade800;
        text = 'Disconnected — reconnecting...';
        icon = Icons.wifi_off;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(top: 40, bottom: 6, left: 12, right: 12),
      color: bgColor,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white, size: 16),
          const SizedBox(width: 8),
          Text(text,
              style: const TextStyle(color: Colors.white, fontSize: 12)),
        ],
      ),
    );
  }
}
