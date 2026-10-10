import 'dart:ui' as ui;

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

/// Renders the UVTT map background image.
///
/// Owns [image]: it is disposed when the component leaves the tree, so a
/// map switch frees the old texture (the TV box has 2 GB RAM).
///
/// A `.dd2vtt` picture is the map, drawn stretched to the map's size. A
/// raster map (image or PDF page) has a [source] rectangle — its
/// [RasterGrid.rect] in picture pixels — that is mapped onto the whole map,
/// so the grid's squares land on the map's squares: a grid that starts
/// inside the picture shows no sliver before it, one with partial edge
/// squares shows the picture's end inside them (dark beyond), and squares
/// that are not square in the picture come out square.
class VttMapImageComponent extends PositionComponent {
  /// The decoded map picture (possibly decoded smaller than [pictureSize]).
  final ui.Image image;

  /// Rectangle of the picture, in [pictureSize] pixels, that covers the
  /// whole map — `null` = the whole picture.
  final Rect? source;

  /// The picture's full size that [source] refers to (the image may be
  /// decoded smaller); `null` = the image's own size.
  final Size? pictureSize;

  /// Creates the component for a map of [mapSize] world pixels.
  VttMapImageComponent({
    required this.image,
    required Vector2 mapSize,
    this.source,
    this.pictureSize,
  }) : super(size: mapSize, priority: 0);

  @override
  void onRemove() {
    image.dispose();
    super.onRemove();
  }

  /// Where the whole image lands in map coordinates for [source] —
  /// shared with the DM layers, which follow the map picture.
  static Rect pictureRectOnMap(Rect source, Size picture, Size map) {
    final sx = map.width / source.width;
    final sy = map.height / source.height;
    return Rect.fromLTWH(
        -source.left * sx, -source.top * sy, picture.width * sx, picture.height * sy);
  }

  @override
  void render(Canvas canvas) {
    final iw = image.width.toDouble(), ih = image.height.toDouble();
    final src = Rect.fromLTWH(0, 0, iw, ih);
    final paint = Paint()..filterQuality = FilterQuality.medium;
    final s = source;
    if (s == null) {
      canvas.drawImageRect(image, src, Rect.fromLTWH(0, 0, size.x, size.y), paint);
      return;
    }
    final mapRect = Rect.fromLTWH(0, 0, size.x, size.y);
    final dst = pictureRectOnMap(s, pictureSize ?? Size(iw, ih), mapRect.size);
    canvas.save();
    canvas.clipRect(mapRect);
    canvas.drawRect(mapRect, Paint()..color = const Color(0xFF0B0B0B));
    canvas.drawImageRect(image, src, dst, paint);
    canvas.restore();
  }
}
