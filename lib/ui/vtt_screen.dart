import 'dart:async';
import 'dart:typed_data';

import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';

import '../game/vtt_game.dart';
import '../network/relay_config.dart';
import '../network/vtt_relay_client.dart';
import '../state/vtt_state.dart';

/// VTT Table Mode — fullscreen map display on the TV.
/// Connects to the VPS relay and waits for companion phone to pair.
class VttScreen extends StatefulWidget {
  const VttScreen({super.key});

  @override
  State<VttScreen> createState() => _VttScreenState();
}

class _VttScreenState extends State<VttScreen> {
  final VttState _state = VttState();
  late final VttGame _game;

  late final VttRelayClient _relay;
  RelayConnectionState _relayState = RelayConnectionState.disconnected;
  StreamSubscription<RelayConnectionState>? _relaySub;
  double? _transferProgress;

  // Throttled broadcast
  bool _dirty = false;
  Timer? _broadcastTimer;

  @override
  void initState() {
    super.initState();
    _state.isInteractive = false;
    _game = VttGame(state: _state);
    _state.addListener(_onStateChanged);
    _connectRelay();
  }

  @override
  void dispose() {
    _state.removeListener(_onStateChanged);
    _broadcastTimer?.cancel();
    _relaySub?.cancel();
    _relay.dispose();
    _state.dispose();
    super.dispose();
  }

  void _connectRelay() {
    _relay = VttRelayClient(role: 'table');
    _relay.onCommand = _handleCommand;
    _relay.onMapLoaded = _onMapReceived;
    _relay.onTransferProgress = (p) {
      setState(() => _transferProgress = p < 0 ? null : p);
    };
    _relaySub = _relay.stateStream.listen((s) {
      setState(() => _relayState = s);
      // When companion connects, send current map + state
      if (s == RelayConnectionState.paired) {
        _sendInitialState();
      }
    });
    _relay.connect();
  }

  void _onMapReceived(Uint8List bytes) {
    _state.loadMap(bytes);
    _game.zoomToFit();
  }

  void _sendInitialState() {
    if (_state.rawMapBytes != null) {
      _relay.sendMapChunked(_state.rawMapBytes!);
    }
    _relay.sendFullState(_state.toJson(), _game.getCameraState());
  }

  void _onStateChanged() {
    setState(() {});
    // Throttle broadcasts to max once per 50ms
    _dirty = true;
    _broadcastTimer ??= Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (_dirty && _relayState == RelayConnectionState.paired) {
        _dirty = false;
        _relay.sendFullState(_state.toJson(), _game.getCameraState());
      }
    });
  }

  void _handleCommand(Map<String, dynamic> msg) {
    try {
      final type = msg['type'] as String;

      switch (type) {
        case 'vtt.clearMap':
          _state.clearMap();
        case 'vtt.toggleReveal':
          _state.toggleReveal(msg['index'] as int);
        case 'vtt.brushReveal':
          final indices = (msg['indices'] as List).cast<int>();
          _state.applyBrushReveal(indices);
        case 'vtt.revealAll':
          if (_state.map != null) {
            final total = _state.map!.resolution.mapSize.dx.toInt() *
                _state.map!.resolution.mapSize.dy.toInt();
            _state.revealAll(total);
          }
        case 'vtt.hideAll':
          _state.hideAll();
        case 'vtt.togglePortal':
          _state.togglePortal(msg['index'] as int);
        case 'vtt.toggleGrid':
          _state.toggleGrid();
        case 'vtt.toggleFog':
          _state.toggleFog();
        case 'vtt.toggleWalls':
          _state.toggleWalls();
        case 'vtt.setBrushRadius':
          _state.setBrushRadius(msg['radius'] as int);
        case 'vtt.toggleRevealMode':
          _state.toggleRevealMode();
        case 'vtt.zoomIn':
          _game.zoomIn();
        case 'vtt.zoomOut':
          _game.zoomOut();
        case 'vtt.zoomToFit':
          _game.zoomToFit();
        case 'vtt.rotateCW':
          _game.rotateCW();
        case 'vtt.rotateCCW':
          _game.rotateCCW();
        case 'vtt.resetRotation':
          _game.resetRotation();
        case 'vtt.calibrate':
          final screenWidth = MediaQueryData.fromView(
            WidgetsBinding.instance.platformDispatcher.views.first,
          ).size.width;
          _state.calibrate(
            (msg['tvWidthInches'] as num).toDouble(),
            screenWidth,
          );
        case 'vtt.resetCalibration':
          _state.resetCalibration();
      }
    } catch (e) {
      debugPrint('VTT command error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Game canvas (fullscreen)
          GameWidget(game: _game),

          // Back button
          Positioned(
            top: 16,
            left: 16,
            child: IconButton(
              autofocus: true,
              icon: const Icon(Icons.arrow_back, color: Colors.white38),
              onPressed: () => Navigator.pop(context),
              focusColor: Colors.white.withValues(alpha: 0.2),
            ),
          ),

          // Relay status (top-right)
          Positioned(
            top: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _relayStatusIcon,
                    color: _relayStatusColor,
                    size: 16,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _relayStatusText,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Transfer progress bar
          if (_transferProgress != null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.downloading, color: Colors.white38, size: 48),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: 240,
                    child: LinearProgressIndicator(
                      value: _transferProgress,
                      backgroundColor: Colors.white12,
                      color: Colors.greenAccent,
                      minHeight: 6,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Receiving map... ${(_transferProgress! * 100).toInt()}%',
                    style: const TextStyle(color: Colors.white38, fontSize: 16),
                  ),
                ],
              ),
            )
          // Waiting hint (center, when no map and no transfer)
          else if (_state.map == null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _relayState == RelayConnectionState.paired
                        ? Icons.check_circle
                        : _relayState == RelayConnectionState.connected
                            ? Icons.wifi_find
                            : Icons.cloud_off,
                    color: _relayState == RelayConnectionState.paired
                        ? Colors.greenAccent
                        : Colors.white12,
                    size: 64,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _waitingHintText,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white38, fontSize: 18),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  IconData get _relayStatusIcon => switch (_relayState) {
        RelayConnectionState.paired => Icons.wifi,
        RelayConnectionState.connected => Icons.wifi_find,
        RelayConnectionState.connecting => Icons.cloud_sync,
        RelayConnectionState.disconnected => Icons.cloud_off,
      };

  Color get _relayStatusColor => switch (_relayState) {
        RelayConnectionState.paired => Colors.greenAccent,
        RelayConnectionState.connected => Colors.orangeAccent,
        RelayConnectionState.connecting => Colors.orangeAccent,
        RelayConnectionState.disconnected => Colors.redAccent,
      };

  String get _relayStatusText => switch (_relayState) {
        RelayConnectionState.paired => 'Companion connected',
        RelayConnectionState.connected => 'Waiting for companion...',
        RelayConnectionState.connecting => 'Connecting to relay...',
        RelayConnectionState.disconnected => 'Disconnected',
      };

  String get _waitingHintText => switch (_relayState) {
        RelayConnectionState.paired =>
          'Companion connected\nLoad a map from your phone',
        RelayConnectionState.connected =>
          'Connected to relay\nOpen VTT Companion on your phone',
        RelayConnectionState.connecting => 'Connecting to relay...',
        RelayConnectionState.disconnected =>
          'Connecting to ${RelayConfig.host}...',
      };
}
