import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

/// A snapshot of a camera transform plus the viewport it looks through.
///
/// Sent by the TV inside every `vtt.fullState` (`camera` object) and used
/// on the phone to draw the TV's visible area as a dashed rectangle
/// ([TvViewportComponent]) and to implement "match TV" / "send view".
///
/// See also:
/// - [VttGame.getCameraState], which produces the JSON form.
/// - [VttGame.setTvViewport], which stores the snapshot on the phone.
class CameraSnapshot {
  /// Camera center X in world (map pixel) coordinates.
  final double x;

  /// Camera center Y in world (map pixel) coordinates.
  final double y;

  /// Camera zoom (screen pixels per world pixel).
  final double zoom;

  /// Camera rotation in radians.
  final double angle;

  /// Viewport width in screen pixels (0 if unknown).
  final double vw;

  /// Viewport height in screen pixels (0 if unknown).
  final double vh;

  /// Creates a snapshot; [vw] and [vh] default to 0 when the sender did not
  /// include them (older TV builds).
  const CameraSnapshot({
    required this.x,
    required this.y,
    required this.zoom,
    required this.angle,
    this.vw = 0,
    this.vh = 0,
  });

  /// Serializes to the `camera` object of `vtt.fullState` / `vtt.setCamera`.
  Map<String, double> toJson() =>
      {'x': x, 'y': y, 'zoom': zoom, 'angle': angle, 'vw': vw, 'vh': vh};

  /// Parses a `camera` object; missing `vw`/`vh` become 0.
  factory CameraSnapshot.fromJson(Map<String, dynamic> json) => CameraSnapshot(
        x: (json['x'] as num).toDouble(),
        y: (json['y'] as num).toDouble(),
        zoom: (json['zoom'] as num).toDouble(),
        angle: (json['angle'] as num?)?.toDouble() ?? 0,
        vw: (json['vw'] as num?)?.toDouble() ?? 0,
        vh: (json['vh'] as num?)?.toDouble() ?? 0,
      );

  /// Whether two snapshots differ by more than rounding noise.
  bool differsFrom(CameraSnapshot? o) =>
      o == null ||
      (x - o.x).abs() > 0.01 ||
      (y - o.y).abs() > 0.01 ||
      (zoom - o.zoom).abs() > 1e-4 ||
      (angle - o.angle).abs() > 1e-4 ||
      (vw - o.vw).abs() > 0.5 ||
      (vh - o.vh).abs() > 0.5;
}

/// Draws the TV's current viewport as a dashed gold rectangle on the phone.
///
/// The phone camera is independent of the TV camera (the DM pans and zooms
/// the phone freely), so this overlay is the only indication of what the
/// players see. The rectangle is `vw / zoom` by `vh / zoom` world pixels,
/// centered on the TV camera position and rotated by its angle.
///
/// Line width and dash length are divided by the phone's current zoom so
/// the outline stays the same thickness on screen at any zoom level.
///
/// Priority 28: above the ruler (25), below global effects (30).
///
/// See also:
/// - [CameraSnapshot], the data this component renders.
/// - [VttGame.setTvViewport], which updates it on every state broadcast.
class TvViewportComponent extends PositionComponent {
  /// Returns the latest TV camera snapshot, or `null` if none arrived yet.
  final CameraSnapshot? Function() snapshot;

  /// Returns the phone camera's current zoom, for screen-constant line width.
  final double Function() screenZoom;

  static final _paint = Paint()
    ..color = const Color(0xFFD4A76A)
    ..style = PaintingStyle.stroke;

  static final _cornerPaint = Paint()..color = const Color(0xFFD4A76A);

  /// Creates the overlay; [mapSize] sets the component bounds.
  TvViewportComponent({
    required this.snapshot,
    required this.screenZoom,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 28);

  @override
  void render(Canvas canvas) {
    final cam = snapshot();
    if (cam == null || cam.vw <= 0 || cam.vh <= 0 || cam.zoom <= 0) return;

    final zoom = max(screenZoom(), 1e-4);
    final w = cam.vw / cam.zoom;
    final h = cam.vh / cam.zoom;
    _paint.strokeWidth = 2.5 / zoom;
    final dash = 14.0 / zoom;
    final gap = 8.0 / zoom;

    canvas.save();
    canvas.translate(cam.x, cam.y);
    canvas.rotate(-cam.angle);
    final rect = Rect.fromCenter(center: Offset.zero, width: w, height: h);
    _dashedLine(canvas, rect.topLeft, rect.topRight, dash, gap);
    _dashedLine(canvas, rect.topRight, rect.bottomRight, dash, gap);
    _dashedLine(canvas, rect.bottomRight, rect.bottomLeft, dash, gap);
    _dashedLine(canvas, rect.bottomLeft, rect.topLeft, dash, gap);
    // Corner dots so the rectangle reads as a frame, not as map detail.
    final r = 4.0 / zoom;
    for (final c in [rect.topLeft, rect.topRight, rect.bottomRight, rect.bottomLeft]) {
      canvas.drawCircle(c, r, _cornerPaint);
    }
    canvas.restore();
  }

  void _dashedLine(Canvas canvas, Offset a, Offset b, double dash, double gap) {
    final dir = b - a;
    final len = dir.distance;
    if (len == 0) return;
    final unit = dir / len;
    var drawn = 0.0;
    while (drawn < len) {
      final end = min(drawn + dash, len);
      canvas.drawLine(a + unit * drawn, a + unit * end, _paint);
      drawn = end + gap;
    }
  }
}
