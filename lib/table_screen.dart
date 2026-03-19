import 'dart:async';

import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'game_state.dart';
import 'game/battlemap_game.dart';

// Conditional import — only available on native (APK), not web
import 'network/server_stub.dart' if (dart.library.io) 'network/server.dart';

/// Table Mode — fullscreen battlemap on the TV.
/// Starts a WebSocket server so companions can connect.
class TableScreen extends StatefulWidget {
  final GameState gameState;
  const TableScreen({super.key, required this.gameState});

  @override
  State<TableScreen> createState() => _TableScreenState();
}

class _TableScreenState extends State<TableScreen> {
  final TransformationController _transformController =
      TransformationController();

  late final BattlemapGame _game;

  BattlemapServer? _server;
  String? _serverIp;
  int _clientCount = 0;
  StreamSubscription<int>? _clientSub;

  GameState get game => widget.gameState;

  @override
  void initState() {
    super.initState();
    _game = BattlemapGame(gameState: game, mode: BattlemapMode.table);
    if (!kIsWeb) _startServer();
  }

  @override
  void dispose() {
    _transformController.dispose();
    _clientSub?.cancel();
    _server?.dispose();
    super.dispose();
  }

  Future<void> _startServer() async {
    _server = BattlemapServer(gameState: game);
    await _server!.start();
    _clientSub = _server!.clientCountStream.listen((count) {
      setState(() => _clientCount = count);
    });
    setState(() => _serverIp = _server!.localIp);
  }

  Offset _toScene(Offset screenPos) {
    final inverse = Matrix4.inverted(_transformController.value);
    return MatrixUtils.transformPoint(inverse, screenPos);
  }

  void _onTapUp(TapUpDetails details) {
    final scenePos = _toScene(details.localPosition);
    _game.handleTapAtScene(scenePos);
  }

  void _onLongPressStart(LongPressStartDetails details) {
    final scenePos = _toScene(details.localPosition);
    _game.handleLongPressAtScene(scenePos);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Battlemap canvas with zoom/pan
          InteractiveViewer(
            transformationController: _transformController,
            minScale: 0.5,
            maxScale: 3.0,
            constrained: false,
            child: GestureDetector(
              onTapUp: _onTapUp,
              onLongPressStart: _onLongPressStart,
              child: SizedBox(
                width: game.gridWidth,
                height: game.gridHeight,
                child: GameWidget(game: _game),
              ),
            ),
          ),
          // Server info + token count (top-right)
          Positioned(
            top: 16,
            right: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (!kIsWeb && _serverIp != null)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _clientCount > 0
                              ? Icons.wifi
                              : Icons.wifi_find,
                          color: _clientCount > 0
                              ? Colors.greenAccent
                              : Colors.orangeAccent,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          '$_serverIp:${_server?.port ?? 8080}',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontFamily: 'monospace',
                          ),
                        ),
                        if (_clientCount > 0) ...[
                          const SizedBox(width: 8),
                          Text(
                            '$_clientCount connected',
                            style: const TextStyle(
                              color: Colors.greenAccent,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${game.tokens.length} tokens',
                    style:
                        const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          // Back button
          Positioned(
            top: 16,
            left: 16,
            child: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white54),
              onPressed: () => Navigator.pop(context),
            ),
          ),
          // Help hint
          Positioned(
            bottom: 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black45,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  kIsWeb
                      ? 'Tap to place token  •  Drag to move  •  Long-press to remove  •  Pinch to zoom'
                      : _clientCount > 0
                          ? 'Companion connected — waiting for input'
                          : 'Enter this address in Companion Mode to connect',
                  style:
                      const TextStyle(color: Colors.white38, fontSize: 11),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
