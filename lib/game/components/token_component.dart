import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../model/map_token.dart';

/// Draws a single token on the battlemap.
/// Accepts a dynamic cellSize instead of hardcoded GameState.cellSize.
class TokenComponent extends PositionComponent {
  String tokenId;
  String label;
  Color color;
  int gridX;
  int gridY;
  final double cellSize;

  TokenComponent({
    required this.tokenId,
    required this.label,
    required this.color,
    required this.gridX,
    required this.gridY,
    required this.cellSize,
  }) : super(
          position: Vector2(
            gridX * cellSize,
            gridY * cellSize,
          ),
          size: Vector2(cellSize, cellSize),
        );

  void updateFrom(MapToken token) {
    label = token.label;
    color = token.color;
    if (gridX != token.gridX || gridY != token.gridY) {
      gridX = token.gridX;
      gridY = token.gridY;
      position = Vector2(
        gridX * cellSize,
        gridY * cellSize,
      );
    }
  }

  @override
  void render(Canvas canvas) {
    final center = Offset(cellSize / 2, cellSize / 2);
    final radius = cellSize * 0.4;

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
      Paint()..color = color,
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
