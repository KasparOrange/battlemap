import 'package:flutter/material.dart';
import 'package:vector_math/vector_math_64.dart' show Vector4;
import 'game_state.dart';
import 'grid_painter.dart';

/// Table Mode — fullscreen battlemap on the TV.
/// Supports pinch-to-zoom, drag-to-pan, tap to place tokens, drag tokens to move.
class TableScreen extends StatefulWidget {
  final GameState gameState;
  const TableScreen({super.key, required this.gameState});

  @override
  State<TableScreen> createState() => _TableScreenState();
}

class _TableScreenState extends State<TableScreen> {
  // Transform for zoom/pan
  final TransformationController _transformController =
      TransformationController();

  // Token dragging
  String? _draggingTokenId;
  Offset? _dragStart;

  GameState get game => widget.gameState;

  @override
  void initState() {
    super.initState();
    game.addListener(_onGameChanged);
  }

  @override
  void dispose() {
    game.removeListener(_onGameChanged);
    _transformController.dispose();
    super.dispose();
  }

  void _onGameChanged() => setState(() {});

  /// Convert screen position to grid coordinates.
  Offset _toScene(Offset screenPos) {
    final matrix = _transformController.value;
    final inverseMatrix = Matrix4.inverted(matrix);
    final vector =
        inverseMatrix.transform3(Vector4(screenPos.dx, screenPos.dy, 0, 1));
    return Offset(vector.x, vector.y);
  }

  (int, int) _toGrid(Offset scenePos) {
    final gx = (scenePos.dx / GameState.cellSize).floor();
    final gy = (scenePos.dy / GameState.cellSize).floor();
    return (
      gx.clamp(0, GameState.gridColumns - 1),
      gy.clamp(0, GameState.gridRows - 1),
    );
  }

  /// Find token at a scene position.
  MapToken? _tokenAt(Offset scenePos) {
    final (gx, gy) = _toGrid(scenePos);
    try {
      return game.tokens.firstWhere((t) => t.gridX == gx && t.gridY == gy);
    } catch (_) {
      return null;
    }
  }

  void _onTapUp(TapUpDetails details) {
    final scenePos = _toScene(details.localPosition);
    final (gx, gy) = _toGrid(scenePos);

    // If tapping an existing token, ignore (could add selection later)
    if (_tokenAt(scenePos) != null) return;

    // Place a new token
    game.addToken(gx, gy);
  }

  void _onLongPressStart(LongPressStartDetails details) {
    final scenePos = _toScene(details.localPosition);
    final token = _tokenAt(scenePos);
    if (token != null) {
      game.removeToken(token.id);
    }
  }

  void _onScaleStart(ScaleStartDetails details) {
    if (details.pointerCount == 1) {
      final scenePos = _toScene(details.localFocalPoint);
      final token = _tokenAt(scenePos);
      if (token != null) {
        _draggingTokenId = token.id;
        _dragStart = scenePos;
      }
    }
  }

  void _onScaleUpdate(ScaleUpdateDetails details) {
    if (_draggingTokenId != null && details.pointerCount == 1) {
      final scenePos = _toScene(details.localFocalPoint);
      final (gx, gy) = _toGrid(scenePos);
      game.moveToken(_draggingTokenId!, gx, gy);
    }
  }

  void _onScaleEnd(ScaleEndDetails details) {
    _draggingTokenId = null;
    _dragStart = null;
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
              child: CustomPaint(
                painter: GridPainter(game),
                size: Size(game.gridWidth, game.gridHeight),
              ),
            ),
          ),
          // Token count badge
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
                '${game.tokens.length} tokens',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
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
                child: const Text(
                  'Tap to place token  •  Drag token to move  •  Long-press to remove  •  Pinch to zoom',
                  style: TextStyle(color: Colors.white38, fontSize: 11),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
