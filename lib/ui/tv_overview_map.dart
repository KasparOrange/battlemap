import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../game/vtt_game.dart';
import '../model/table_fit.dart';
import '../state/vtt_state.dart';

/// The whole map in miniature with a gold box around what the players see
/// on the TV — the companion's overview (Camera tab).
///
/// In the TV's table view the box is its window of whole one-inch squares
/// ([VttGame.tvTableLayout]); tap or drag anywhere to move it there (snapped
/// to squares and clamped to the map, shown at once, sent through
/// [VttGame.onTvWindowDrag] as `vtt.setTableWindow`). Outside the box the
/// map is dimmed — that part is off the table. In the whole-map or free
/// view it shows the TV's screen rectangle and does not react to touch.
///
/// Independent of the tablet's own camera, so the DM can stay zoomed in on
/// a room while seeing the whole map here. Draws the picture the game has
/// already decoded ([VttGame.mapImage]), so it costs no extra memory, and
/// repaints on [VttGame.viewRevision] (TV camera, map picture) and on the
/// rebuilds the host does for state changes.
class TvOverviewMap extends StatelessWidget {
  /// The companion's game (map picture, TV camera, table layout).
  final VttGame game;

  /// The shared state (map size, TV mode).
  final VttState state;

  /// Tallest the overview may get, in logical pixels.
  final double maxHeight;

  /// Creates the overview for [game] / [state].
  const TvOverviewMap({
    super.key,
    required this.game,
    required this.state,
    this.maxHeight = 220,
  });

  @override
  Widget build(BuildContext context) {
    final map = state.map;
    if (map == null) return const SizedBox.shrink();
    final mapW = map.pixelWidth;
    final mapH = map.pixelHeight;
    return ValueListenableBuilder<int>(
      valueListenable: game.viewRevision,
      builder: (context, _, _) => LayoutBuilder(
        builder: (context, constraints) {
          final scale = min(constraints.maxWidth / mapW, maxHeight / mapH);
          final size = Size(mapW * scale, mapH * scale);
          final layout = game.tvTableLayout();
          final draggable = layout != null && layout.pans;
          void moveTo(Offset local, {required bool done}) {
            final ppg = map.resolution.pixelsPerGrid.toDouble();
            game.previewTvWindow(
                Offset(local.dx / scale / ppg, local.dy / scale / ppg),
                done: done);
          }

          return Center(
            child: GestureDetector(
              onTapUp: draggable ? (d) => moveTo(d.localPosition, done: true) : null,
              onPanUpdate: draggable ? (d) => moveTo(d.localPosition, done: false) : null,
              onPanEnd: draggable ? (_) => game.endTvWindowDrag() : null,
              child: CustomPaint(
                size: size,
                painter: _OverviewPainter(
                  image: game.mapImage,
                  scale: scale,
                  window: _windowRect(layout, scale),
                  screen: layout == null ? _screenQuad(scale) : null,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// The table window in overview pixels, or `null` outside table view.
  Rect? _windowRect(TableLayout? layout, double scale) {
    if (layout == null) return null;
    final sq = layout.windowSquares;
    final s = layout.cellPx * scale;
    return Rect.fromLTRB(sq.left * s, sq.top * s, sq.right * s, sq.bottom * s);
  }

  /// The TV's screen (whole map / free view) as four corners in overview
  /// pixels, turned by the TV's angle, or `null` without a camera.
  List<Offset>? _screenQuad(double scale) {
    final cam = game.tvCamera;
    if (cam == null || cam.vw <= 0 || cam.vh <= 0 || cam.zoom <= 0) return null;
    final hw = cam.vw / cam.zoom / 2;
    final hh = cam.vh / cam.zoom / 2;
    final c = cos(-cam.angle);
    final s = sin(-cam.angle);
    return [
      for (final p in [Offset(-hw, -hh), Offset(hw, -hh), Offset(hw, hh), Offset(-hw, hh)])
        Offset(cam.x + p.dx * c - p.dy * s, cam.y + p.dx * s + p.dy * c) * scale,
    ];
  }
}

class _OverviewPainter extends CustomPainter {
  final ui.Image? image;
  final double scale;
  final Rect? window;
  final List<Offset>? screen;

  _OverviewPainter({
    required this.image,
    required this.scale,
    required this.window,
    required this.screen,
  });

  static const _gold = Color(0xFFD4A76A);

  @override
  void paint(Canvas canvas, Size size) {
    final all = Offset.zero & size;
    final img = image;
    if (img != null) {
      canvas.drawImageRect(
        img,
        Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()),
        all,
        Paint()..filterQuality = FilterQuality.medium,
      );
    } else {
      canvas.drawRect(all, Paint()..color = const Color(0xFF2A2A2A));
    }
    final w = window;
    if (w != null) {
      canvas.save();
      canvas.clipRect(all);
      canvas.drawPath(
        Path()
          ..fillType = PathFillType.evenOdd
          ..addRect(all)
          ..addRect(w),
        Paint()..color = const Color(0x99000000),
      );
      canvas.drawRect(
          w,
          Paint()
            ..color = _gold
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2);
      canvas.restore();
    }
    final q = screen;
    if (q != null) {
      canvas.drawPath(
        Path()..addPolygon(q, true),
        Paint()
          ..color = _gold
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }
    canvas.drawRect(
        all,
        Paint()
          ..color = const Color(0xFF5a4a30)
          ..style = PaintingStyle.stroke);
  }

  @override
  bool shouldRepaint(_OverviewPainter old) => true;
}
