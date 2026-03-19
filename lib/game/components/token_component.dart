import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../game_state.dart';

/// Draws a single token on the battlemap.
class TokenComponent extends PositionComponent {
  String tokenId;
  String label;
  Color color;
  int gridX;
  int gridY;

  TokenComponent({
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
