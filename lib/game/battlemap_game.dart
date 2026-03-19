import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import '../game_state.dart';
import 'components/grid_component.dart';
import 'components/live_stroke_component.dart';
import 'components/pdf_background_component.dart';
import 'components/strokes_component.dart';
import 'components/token_layer.dart';

enum BattlemapMode { table, companion }

/// The Flame game that renders the battlemap canvas.
/// Used by both Table Mode and Companion Mode.
class BattlemapGame extends FlameGame {
  final GameState gameState;
  final BattlemapMode mode;

  late final PdfBackgroundComponent _pdfBackground;
  late final GridComponent _grid;
  late final StrokesComponent _strokes;
  late final LiveStrokeComponent _liveStroke;
  late final TokenLayer _tokenLayer;

  // Companion drawing state (set from outside by CompanionScreen)
  Color brushColor = const Color(0xFFE53935);
  double brushWidth = 3.0;

  // Local live stroke points (companion's own drawing in progress)
  List<Offset>? localStrokePoints;

  BattlemapGame({
    required this.gameState,
    required this.mode,
  });

  @override
  Color backgroundColor() => const Color(0xFF1A1A2E);

  @override
  Future<void> onLoad() async {
    await super.onLoad();

    // Fixed camera — InteractiveViewer handles zoom/pan externally
    camera.viewfinder.zoom = 1.0;
    camera.viewfinder.position = Vector2(
      gameState.gridWidth / 2,
      gameState.gridHeight / 2,
    );

    _pdfBackground = PdfBackgroundComponent();
    _grid = GridComponent();
    _strokes = StrokesComponent();
    _liveStroke = LiveStrokeComponent();
    _tokenLayer = TokenLayer();

    world.addAll([
      _pdfBackground,
      _grid,
      _strokes,
      _liveStroke,
      _tokenLayer,
    ]);

    // Initial sync
    _syncAll();

    // Listen for state changes
    gameState.addListener(_onStateChanged);
  }

  @override
  void onRemove() {
    gameState.removeListener(_onStateChanged);
    super.onRemove();
  }

  void _onStateChanged() {
    _syncAll();
  }

  void _syncAll() {
    _pdfBackground.syncFromState(gameState);
    _grid.syncFromState(gameState);
    _strokes.syncFromState(gameState);
    _liveStroke.syncFromState(gameState);
    _tokenLayer.syncFromState(gameState);
  }

  // --- Input methods called by screen widgets ---

  void handleTapAtScene(Offset scenePos) {
    final (gx, gy) = _toGrid(scenePos);
    // Don't place if a token is already there
    final existing = gameState.tokens.any((t) => t.gridX == gx && t.gridY == gy);
    if (!existing) {
      gameState.addToken(gx, gy);
    }
  }

  void handleLongPressAtScene(Offset scenePos) {
    final (gx, gy) = _toGrid(scenePos);
    try {
      final token = gameState.tokens.firstWhere(
        (t) => t.gridX == gx && t.gridY == gy,
      );
      gameState.removeToken(token.id);
    } catch (_) {
      // No token at position
    }
  }

  void handleDragStartAtScene(Offset scenePos) {
    localStrokePoints = [scenePos];
    _liveStroke.setLocalStroke(localStrokePoints, brushColor, brushWidth);
  }

  void handleDragUpdateAtScene(Offset scenePos) {
    localStrokePoints?.add(scenePos);
    _liveStroke.setLocalStroke(localStrokePoints, brushColor, brushWidth);
  }

  DrawStroke? handleDragEndAtScene() {
    DrawStroke? completedStroke;
    if (localStrokePoints != null && localStrokePoints!.length >= 2) {
      completedStroke = DrawStroke(
        points: List.from(localStrokePoints!),
        color: brushColor,
        width: brushWidth,
      );
    }
    localStrokePoints = null;
    _liveStroke.setLocalStroke(null, brushColor, brushWidth);
    return completedStroke;
  }

  (int, int) _toGrid(Offset scenePos) {
    final gx = (scenePos.dx / GameState.cellSize).floor();
    final gy = (scenePos.dy / GameState.cellSize).floor();
    return (
      gx.clamp(0, GameState.gridColumns - 1),
      gy.clamp(0, GameState.gridRows - 1),
    );
  }
}
