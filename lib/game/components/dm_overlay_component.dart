import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../state/vtt_state.dart';
import '../dm_overlay_images.dart';

/// Draws the DM-only picture layers ([VttState.dmOverlays]) — companion only.
///
/// Priority 12: above the fog (10), so secrets in unrevealed rooms stay
/// readable through the DM's dark fog, below the AoE template (15),
/// measure line, ruler and TV frame. Layers are drawn bottom-first, each
/// with its own opacity, fitted inside the map bounds keeping the aspect
/// ratio and centered — a DM version of the map (same proportions) lines
/// up exactly with the map.
///
/// Draws nothing while [VttState.showDmOverlays] is off. Pictures that are
/// still loading are skipped.
///
/// See also:
/// - [DmOverlayImages], which supplies the decoded pictures.
class DmOverlayComponent extends PositionComponent {
  /// The state whose [VttState.dmOverlays] are drawn.
  final VttState state;

  /// The phone-side picture cache.
  final DmOverlayImages images;

  final Paint _paint = Paint()..filterQuality = FilterQuality.medium;

  /// Creates the layer component covering [mapSize] world pixels.
  DmOverlayComponent({
    required this.state,
    required this.images,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 12);

  @override
  void render(Canvas canvas) {
    if (!state.showDmOverlays) return;
    for (final overlay in state.dmOverlays) {
      if (!overlay.visible || overlay.opacity <= 0) continue;
      final image = images.imageFor(overlay.id);
      if (image == null) continue;
      final iw = image.width.toDouble();
      final ih = image.height.toDouble();
      final scale = min(size.x / iw, size.y / ih);
      final w = iw * scale;
      final h = ih * scale;
      // The paint's alpha sets the picture's opacity.
      _paint.color = Color.fromRGBO(255, 255, 255, overlay.opacity);
      canvas.drawImageRect(
        image,
        Rect.fromLTWH(0, 0, iw, ih),
        Rect.fromLTWH((size.x - w) / 2, (size.y - h) / 2, w, h),
        _paint,
      );
    }
  }
}
