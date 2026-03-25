import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import '../game_state.dart';
import 'components/grid_component.dart';
import 'components/pdf_background_component.dart';

enum BattlemapMode { table, companion }

/// The Flame game that renders the battlemap canvas (legacy, non-VTT).
/// Used by both Table Mode and Companion Mode for the old PDF-based flow.
class BattlemapGame extends FlameGame {
  final GameState gameState;
  final BattlemapMode mode;

  late final PdfBackgroundComponent _pdfBackground;
  late final GridComponent _grid;
  late final _LegacyStrokesComponent _strokes;
  late final _LegacyLiveStrokeComponent _liveStroke;
  late final _LegacyTokenLayer _tokenLayer;

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
    _strokes = _LegacyStrokesComponent();
    _liveStroke = _LegacyLiveStrokeComponent();
    _tokenLayer = _LegacyTokenLayer();

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

// ===== Legacy inline components for BattlemapGame (GameState-based) =====
// These are kept here so the old PDF-based flow still works.
// The main shared components in components/ are now VttState-based.

class _LegacyStrokesComponent extends PositionComponent {
  List<DrawStroke> _strokes = [];

  _LegacyStrokesComponent()
      : super(
          size: Vector2(
            GameState.gridColumns * GameState.cellSize,
            GameState.gridRows * GameState.cellSize,
          ),
          priority: 2,
        );

  void syncFromState(GameState gs) {
    _strokes = gs.strokes;
  }

  @override
  void render(Canvas canvas) {
    for (final stroke in _strokes) {
      if (stroke.points.length < 2) continue;
      final paint = Paint()
        ..color = stroke.color
        ..strokeWidth = stroke.width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;

      final path = Path()..moveTo(stroke.points[0].dx, stroke.points[0].dy);
      for (int i = 1; i < stroke.points.length; i++) {
        path.lineTo(stroke.points[i].dx, stroke.points[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }
}

class _LegacyLiveStrokeComponent extends PositionComponent {
  DrawStroke? _remoteStroke;
  List<Offset>? _localPoints;
  Color _localColor = Colors.red;
  double _localWidth = 3.0;

  _LegacyLiveStrokeComponent()
      : super(
          size: Vector2(
            GameState.gridColumns * GameState.cellSize,
            GameState.gridRows * GameState.cellSize,
          ),
          priority: 3,
        );

  void syncFromState(GameState gs) {
    _remoteStroke = gs.liveStroke;
  }

  void setLocalStroke(List<Offset>? points, Color color, double width) {
    _localPoints = points;
    _localColor = color;
    _localWidth = width;
  }

  @override
  void render(Canvas canvas) {
    _drawStroke(canvas, _remoteStroke?.points, _remoteStroke?.color, _remoteStroke?.width);
    _drawStroke(canvas, _localPoints, _localColor, _localWidth);
  }

  void _drawStroke(Canvas canvas, List<Offset>? points, Color? color, double? width) {
    if (points == null || points.length < 2 || color == null || width == null) return;
    final paint = Paint()
      ..color = color.withValues(alpha: 0.7)
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final path = Path()..moveTo(points[0].dx, points[0].dy);
    for (int i = 1; i < points.length; i++) {
      path.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, paint);
  }
}

class _LegacyTokenLayer extends Component {
  _LegacyTokenLayer() : super(priority: 4);

  void syncFromState(GameState gs) {
    final stateTokens = gs.tokens;
    final stateIds = stateTokens.map((t) => t.id).toSet();

    final childMap = <String, _LegacyTokenComponent>{};
    for (final child in children.whereType<_LegacyTokenComponent>()) {
      childMap[child.tokenId] = child;
    }

    for (final entry in childMap.entries) {
      if (!stateIds.contains(entry.key)) {
        entry.value.removeFromParent();
      }
    }

    for (final token in stateTokens) {
      final existing = childMap[token.id];
      if (existing != null) {
        existing.updateFrom(token);
      } else {
        add(_LegacyTokenComponent(
          tokenId: token.id,
          label: token.label,
          color: token.color,
          gridX: token.gridX,
          gridY: token.gridY,
        ));
      }
    }
  }
}

class _LegacyTokenComponent extends PositionComponent {
  String tokenId;
  String label;
  Color color;
  int gridX;
  int gridY;

  _LegacyTokenComponent({
    required this.tokenId,
    required this.label,
    required this.color,
    required this.gridX,
    required this.gridY,
  }) : super(
          position: Vector2(
            gridX * GameState.cellSize,
            gridY * GameState.cellSize,
          ),
          size: Vector2(GameState.cellSize, GameState.cellSize),
        );

  void updateFrom(MapToken token) {
    label = token.label;
    color = token.color;
    if (gridX != token.gridX || gridY != token.gridY) {
      gridX = token.gridX;
      gridY = token.gridY;
      position = Vector2(
        gridX * GameState.cellSize,
        gridY * GameState.cellSize,
      );
    }
  }

  @override
  void render(Canvas canvas) {
    final cell = GameState.cellSize;
    final center = Offset(cell / 2, cell / 2);
    final radius = cell * 0.4;

    canvas.drawCircle(
      center + const Offset(1, 2),
      radius,
      Paint()..color = Colors.black38,
    );

    canvas.drawCircle(center, radius, Paint()..color = color);

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = Colors.white24
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    final textPainter = TextPainter(
      text: TextSpan(
        text: label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 16,
          fontWeight: FontWeight.bold,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    textPainter.paint(
      canvas,
      center - Offset(textPainter.width / 2, textPainter.height / 2),
    );
  }
}
