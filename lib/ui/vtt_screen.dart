import 'dart:async';
import 'dart:io' show NetworkInterface, InternetAddressType;

import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../game/vtt_game.dart';
import '../state/vtt_state.dart';

// Conditional import for server
import '../network/vtt_server_stub.dart'
    if (dart.library.io) '../network/vtt_server.dart';

/// VTT Table Mode — fullscreen map display on the TV.
/// Starts a WebSocket server and waits for companion phone to connect.
class VttScreen extends StatefulWidget {
  const VttScreen({super.key});

  @override
  State<VttScreen> createState() => _VttScreenState();
}

class _VttScreenState extends State<VttScreen> {
  final VttState _state = VttState();
  late final VttGame _game;

  VttServer? _server;
  String? _serverIp;
  int _clientCount = 0;
  StreamSubscription<int>? _clientSub;

  // On-screen debug log
  final List<String> _logs = [];
  static const int _maxLogs = 20;

  void _log(String msg) {
    final ts = DateTime.now().toString().substring(11, 19);
    setState(() {
      _logs.add('[$ts] $msg');
      if (_logs.length > _maxLogs) _logs.removeAt(0);
    });
    debugPrint('VTT-TV: $msg');
  }

  @override
  void initState() {
    super.initState();
    _state.isInteractive = false;
    _game = VttGame(state: _state);
    _state.addListener(_onStateChanged);
    _log('VTT Table Mode started');
    if (!kIsWeb) {
      _startServer();
    } else {
      _log('Web build — server disabled');
      _detectNetworkInfo();
    }
  }

  @override
  void dispose() {
    _state.removeListener(_onStateChanged);
    _clientSub?.cancel();
    _server?.dispose();
    _state.dispose();
    super.dispose();
  }

  void _onStateChanged() => setState(() {});

  Future<void> _detectNetworkInfo() async {
    try {
      if (!kIsWeb) {
        final interfaces = await NetworkInterface.list(
          type: InternetAddressType.IPv4,
          includeLoopback: false,
        );
        for (final iface in interfaces) {
          for (final addr in iface.addresses) {
            _log('Network: ${iface.name} = ${addr.address}');
          }
        }
      }
    } catch (e) {
      _log('Network detection failed: $e');
    }
  }

  Future<void> _startServer() async {
    _log('Starting WebSocket server on port 8080...');
    await _detectNetworkInfo();
    try {
      _server = VttServer(state: _state, game: _game);
      await _server!.start();
      _clientSub = _server!.clientCountStream.listen((count) {
        if (count != _clientCount) {
          _log('Clients: $count');
        }
        setState(() => _clientCount = count);
      });
      setState(() => _serverIp = _server!.localIp);
      _log('Server started on ${_server!.localIp}:${_server!.port}');
    } catch (e) {
      _log('Server FAILED: $e');
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

          // Server info (top-right)
          Positioned(
            top: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _clientCount > 0 ? Icons.wifi : Icons.wifi_find,
                        color: _clientCount > 0
                            ? Colors.greenAccent
                            : Colors.orangeAccent,
                        size: 16,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _serverIp != null
                            ? '$_serverIp:${_server?.port ?? 8080}'
                            : 'Starting...',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 13,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                  if (_clientCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        '$_clientCount companion(s) connected',
                        style: const TextStyle(
                          color: Colors.greenAccent,
                          fontSize: 11,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),

          // Waiting hint (center, when no map)
          if (_state.map == null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _clientCount > 0 ? Icons.check_circle : Icons.wifi_find,
                    color:
                        _clientCount > 0 ? Colors.greenAccent : Colors.white12,
                    size: 64,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _clientCount > 0
                        ? 'Companion connected\nLoad a map from your phone'
                        : _serverIp != null
                            ? 'Open VTT Companion on your phone\nand connect to:'
                            : 'Starting server...',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white38, fontSize: 18),
                  ),
                  if (_serverIp != null && _clientCount == 0) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '$_serverIp:${_server?.port ?? 8080}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),

          // On-screen debug log (bottom-left)
          if (_logs.isNotEmpty)
            Positioned(
              bottom: 8,
              left: 8,
              child: Container(
                width: 420,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final log in _logs)
                      Text(
                        log,
                        style: const TextStyle(
                          color: Colors.white38,
                          fontSize: 10,
                          fontFamily: 'monospace',
                          height: 1.4,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
