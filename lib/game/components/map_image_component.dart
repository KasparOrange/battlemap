import 'dart:ui' as ui;

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

/// Renders the UVTT map background image.
///
/// Owns [image]: it is disposed when the component leaves the tree, so a
/// map switch frees the old texture (the TV box has 2 GB RAM).
class VttMapImageComponent extends PositionComponent {
  /// The decoded map picture, drawn stretched to the map's pixel size.
  final ui.Image image;

  VttMapImageComponent({
    required this.image,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 0);

  @override
  void onRemove() {
    image.dispose();
    super.onRemove();
  }

  @override
  void render(Canvas canvas) {
    final src = Rect.fromLTWH(
      0, 0, image.width.toDouble(), image.height.toDouble(),
    );
    final dst = Rect.fromLTWH(0, 0, size.x, size.y);
    canvas.drawImageRect(
      image,
      src,
      dst,
      Paint()..filterQuality = FilterQuality.medium,
    );
  }
}
