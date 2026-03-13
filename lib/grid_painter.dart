import 'package:flutter/material.dart';
import 'game_state.dart';

/// Paints the battlemap grid, tokens, and drawings.
class GridPainter extends CustomPainter {
  final GameState gameState;

  GridPainter(this.gameState);

  @override
  void paint(Canvas canvas, Size size) {
    _drawGrid(canvas);
    _drawStrokes(canvas);
    _drawTokens(canvas);
  }

  void _drawGrid(Canvas canvas) {
    final paint = Paint()
      ..color = const Color(0xFF2A2A4A)
      ..strokeWidth = 1.0;

    final cols = GameState.gridColumns;
    final rows = GameState.gridRows;
    final cell = GameState.cellSize;

    // Vertical lines
    for (int i = 0; i <= cols; i++) {
      canvas.drawLine(
        Offset(i * cell, 0),
        Offset(i * cell, rows * cell),
        paint,
      );
    }

    // Horizontal lines
    for (int j = 0; j <= rows; j++) {
      canvas.drawLine(
        Offset(0, j * cell),
        Offset(cols * cell, j * cell),
        paint,
      );
    }
  }

  void _drawStrokes(Canvas canvas) {
    for (final stroke in gameState.strokes) {
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

  void _drawTokens(Canvas canvas) {
    final cell = GameState.cellSize;

    for (final token in gameState.tokens) {
      final center = Offset(
        token.gridX * cell + cell / 2,
        token.gridY * cell + cell / 2,
      );
      final radius = cell * 0.4;

      // Shadow
      canvas.drawCircle(
        center + const Offset(1, 2),
        radius,
        Paint()..color = Colors.black38,
      );

      // Token circle
      canvas.drawCircle(
        center,
        radius,
        Paint()..color = token.color,
      );

      // Border
      canvas.drawCircle(
        center,
        radius,
        Paint()
          ..color = Colors.white24
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );

      // Label
      final textPainter = TextPainter(
        text: TextSpan(
          text: token.label,
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

  @override
  bool shouldRepaint(covariant GridPainter oldDelegate) => true;
}
