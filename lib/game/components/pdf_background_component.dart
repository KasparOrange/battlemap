import 'dart:ui' as ui;

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../game_state.dart';

/// Draws the PDF background image fitted to the grid area.
class PdfBackgroundComponent extends PositionComponent {
  ui.Image? _image;

  PdfBackgroundComponent()
      : super(
          size: Vector2(
            GameState.gridColumns * GameState.cellSize,
            GameState.gridRows * GameState.cellSize,
          ),
          priority: 0,
        );

  void syncFromState(GameState gs) {
    _image = gs.backgroundImage;
  }

  @override
  void render(Canvas canvas) {
    final image = _image;
    if (image == null) return;

    final src = Rect.fromLTWH(
      0,
      0,
      image.width.toDouble(),
      image.height.toDouble(),
    );
    final dst = Rect.fromLTWH(0, 0, size.x, size.y);

    // Maintain aspect ratio — fit inside, centered
    final scaleX = dst.width / src.width;
    final scaleY = dst.height / src.height;
    final fitScale = scaleX < scaleY ? scaleX : scaleY;
    final fitW = src.width * fitScale;
    final fitH = src.height * fitScale;
    final fitRect = Rect.fromLTWH(
      (dst.width - fitW) / 2,
      (dst.height - fitH) / 2,
      fitW,
      fitH,
    );

    canvas.drawImageRect(
      image,
      src,
      fitRect,
      Paint()..filterQuality = FilterQuality.medium,
    );
  }
}
