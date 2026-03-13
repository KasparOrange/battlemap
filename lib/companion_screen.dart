import 'package:flutter/material.dart';
import 'game_state.dart';
import 'grid_painter.dart';

/// Companion Mode — phone controller for drawing on the battlemap.
class CompanionScreen extends StatefulWidget {
  final GameState gameState;
  const CompanionScreen({super.key, required this.gameState});

  @override
  State<CompanionScreen> createState() => _CompanionScreenState();
}

class _CompanionScreenState extends State<CompanionScreen> {
  final TransformationController _transformController =
      TransformationController();

  // Drawing state
  List<Offset>? _currentStrokePoints;
  Color _brushColor = const Color(0xFFE53935);
  double _brushWidth = 3.0;
  bool _isDrawing = true; // true = draw mode, false = token mode

  static const List<Color> brushColors = [
    Color(0xFFE53935), // red
    Color(0xFF43A047), // green
    Color(0xFF1E88E5), // blue
    Color(0xFFFDD835), // yellow
    Color(0xFFFF8F00), // orange
    Color(0xFFFFFFFF), // white
  ];

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

  Offset _toScene(Offset screenPos) {
    final inverse = Matrix4.inverted(_transformController.value);
    return MatrixUtils.transformPoint(inverse, screenPos);
  }

  (int, int) _toGrid(Offset scenePos) {
    final gx = (scenePos.dx / GameState.cellSize).floor();
    final gy = (scenePos.dy / GameState.cellSize).floor();
    return (
      gx.clamp(0, GameState.gridColumns - 1),
      gy.clamp(0, GameState.gridRows - 1),
    );
  }

  void _onPanStart(DragStartDetails details) {
    if (!_isDrawing) return;
    final scenePos = _toScene(details.localPosition);
    setState(() {
      _currentStrokePoints = [scenePos];
    });
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (!_isDrawing || _currentStrokePoints == null) return;
    final scenePos = _toScene(details.localPosition);
    setState(() {
      _currentStrokePoints!.add(scenePos);
    });
  }

  void _onPanEnd(DragEndDetails details) {
    if (!_isDrawing || _currentStrokePoints == null) return;
    if (_currentStrokePoints!.length >= 2) {
      game.addStroke(DrawStroke(
        points: List.from(_currentStrokePoints!),
        color: _brushColor,
        width: _brushWidth,
      ));
    }
    setState(() {
      _currentStrokePoints = null;
    });
  }

  void _onTapUp(TapUpDetails details) {
    if (_isDrawing) return;
    // Token mode: tap to place
    final scenePos = _toScene(details.localPosition);
    final (gx, gy) = _toGrid(scenePos);
    game.addToken(gx, gy);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isDrawing ? 'Draw Mode' : 'Token Mode'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          if (_isDrawing)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Clear drawings',
              onPressed: game.clearDrawings,
            ),
        ],
      ),
      body: Column(
        children: [
          // Toolbar
          _buildToolbar(),
          // Canvas
          Expanded(
            child: InteractiveViewer(
              transformationController: _transformController,
              minScale: 0.5,
              maxScale: 3.0,
              constrained: false,
              panEnabled: !_isDrawing,
              scaleEnabled: !_isDrawing,
              child: GestureDetector(
                onPanStart: _isDrawing ? _onPanStart : null,
                onPanUpdate: _isDrawing ? _onPanUpdate : null,
                onPanEnd: _isDrawing ? _onPanEnd : null,
                onTapUp: !_isDrawing ? _onTapUp : null,
                child: CustomPaint(
                  painter: _CompanionPainter(game, _currentStrokePoints,
                      _brushColor, _brushWidth),
                  size: Size(game.gridWidth, game.gridHeight),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToolbar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: Colors.black26,
      child: Row(
        children: [
          // Mode toggle
          ToggleButtons(
            isSelected: [_isDrawing, !_isDrawing],
            onPressed: (i) => setState(() => _isDrawing = i == 0),
            borderRadius: BorderRadius.circular(8),
            selectedColor: Colors.white,
            fillColor: Colors.white.withValues(alpha: 0.15),
            constraints: const BoxConstraints(minHeight: 36, minWidth: 44),
            children: const [
              Icon(Icons.brush, size: 20),
              Icon(Icons.person_pin, size: 20),
            ],
          ),
          const SizedBox(width: 16),
          // Brush colors (only in draw mode)
          if (_isDrawing) ...[
            for (final color in brushColors)
              GestureDetector(
                onTap: () => setState(() => _brushColor = color),
                child: Container(
                  width: 28,
                  height: 28,
                  margin: const EdgeInsets.only(right: 6),
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _brushColor == color
                          ? Colors.white
                          : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
              ),
            const SizedBox(width: 8),
            // Brush size
            SizedBox(
              width: 100,
              child: Slider(
                value: _brushWidth,
                min: 1,
                max: 10,
                onChanged: (v) => setState(() => _brushWidth = v),
              ),
            ),
          ],
          if (!_isDrawing)
            Text(
              '${game.tokens.length} tokens placed',
              style: const TextStyle(color: Colors.white54, fontSize: 13),
            ),
        ],
      ),
    );
  }
}

/// Painter for companion view — includes live stroke preview.
class _CompanionPainter extends CustomPainter {
  final GameState gameState;
  final List<Offset>? currentStroke;
  final Color brushColor;
  final double brushWidth;

  _CompanionPainter(
      this.gameState, this.currentStroke, this.brushColor, this.brushWidth);

  @override
  void paint(Canvas canvas, Size size) {
    // Reuse grid painter for the base
    GridPainter(gameState).paint(canvas, size);

    // Draw live stroke
    if (currentStroke != null && currentStroke!.length >= 2) {
      final paint = Paint()
        ..color = brushColor
        ..strokeWidth = brushWidth
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;

      final path = Path()
        ..moveTo(currentStroke![0].dx, currentStroke![0].dy);
      for (int i = 1; i < currentStroke!.length; i++) {
        path.lineTo(currentStroke![i].dx, currentStroke![i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _CompanionPainter oldDelegate) => true;
}
