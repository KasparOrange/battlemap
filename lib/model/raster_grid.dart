import 'dart:math';
import 'dart:ui';

import 'grid_detect.dart';

/// Where the squares of a picture map (image or rendered PDF page) lie on
/// the picture — battlemap's grid for maps that carry no grid data.
///
/// The grid is [cols] × [rows] squares of [cellW] × [cellH] picture pixels
/// whose top-left corner sits at ([x], [y]). Its rectangle ([rect]) is what
/// the game stretches onto the map's `cols × rows` squares, so the squares
/// come out square on the table even when the picture's are not (a photo).
/// [x]/[y] may be negative and [rect] may reach past the picture: partial
/// squares at the edges, drawn empty where the picture ends. Nothing is
/// cropped or resampled — the renderer maps [rect] onto the map.
///
/// All lengths refer to a picture of [pictureW] × [pictureH] pixels; a
/// picture decoded at another size (a PDF rendered at another resolution)
/// uses [forPicture].
///
/// The legacy grid — "this many columns and rows over the whole picture" —
/// is [RasterGrid.whole].
///
/// See also:
/// - [GridDetection.toRasterGrid], a drawn grid found in the picture.
/// - `showGridEditor` (`lib/ui/grid_editor.dart`), the DM's fine-tuning.
/// - `docs/architecture.md` "picture grid".
class RasterGrid {
  /// Left edge of square (0, 0) in picture pixels (negative = a partial
  /// first column).
  final double x;

  /// Top edge of square (0, 0) in picture pixels (negative = a partial
  /// first row).
  final double y;

  /// Width of one square in picture pixels (> 0).
  final double cellW;

  /// Height of one square in picture pixels (> 0).
  final double cellH;

  /// Number of columns (≥ 1).
  final int cols;

  /// Number of rows (≥ 1).
  final int rows;

  /// Width of the picture the lengths refer to.
  final double pictureW;

  /// Height of the picture the lengths refer to.
  final double pictureH;

  /// Creates a grid; see the class docs for the fields.
  const RasterGrid({
    required this.x,
    required this.y,
    required this.cellW,
    required this.cellH,
    required this.cols,
    required this.rows,
    required this.pictureW,
    required this.pictureH,
  });

  /// [cols] × [rows] squares stretched over the whole [picture] — the grid
  /// of every picture map before 2026-10-10 and of the simple squares dialog.
  factory RasterGrid.whole(int cols, int rows, Size picture) => RasterGrid(
        x: 0,
        y: 0,
        cellW: picture.width / max(1, cols),
        cellH: picture.height / max(1, rows),
        cols: max(1, cols),
        rows: max(1, rows),
        pictureW: picture.width,
        pictureH: picture.height,
      );

  /// The grid through a vertical line at [lineX] and a horizontal one at
  /// [lineY] with squares of [cellW] × [cellH], covering [picture]:
  /// - [partialEdges] `false`: whole squares only — a sliver at an edge
  ///   narrower than [edgeTolerance] of a square still counts as a whole
  ///   square, anything wider stays outside the grid;
  /// - [partialEdges] `true`: every bit of the picture is in a square, the
  ///   edge squares reach past the picture (drawn empty there).
  factory RasterGrid.fromLines({
    required double lineX,
    required double lineY,
    required double cellW,
    required double cellH,
    required Size picture,
    bool partialEdges = false,
  }) {
    (double, int) axis(double line, double cell, double length) {
      var start = line % cell; // first line at or after the edge
      if (start < 0) start += cell;
      if (start > (1 - edgeTolerance) * cell) start -= cell; // a hair before
      if (partialEdges) {
        if (start > edgeTolerance * cell) start -= cell;
        final n = ((length - start) / cell - edgeTolerance).ceil();
        return (start, max(1, n));
      }
      final n = ((length - start) / cell + edgeTolerance).floor();
      return (start, max(1, n));
    }

    final (x0, c) = axis(lineX, cellW, picture.width);
    final (y0, r) = axis(lineY, cellH, picture.height);
    return RasterGrid(
      x: x0,
      y: y0,
      cellW: cellW,
      cellH: cellH,
      cols: c,
      rows: r,
      pictureW: picture.width,
      pictureH: picture.height,
    );
  }

  /// How far (a fraction of a square) an edge sliver may be and still be
  /// ignored (whole squares) or rounded away (partial edges).
  static const double edgeTolerance = 0.15;

  /// Smallest square side the editor allows, in picture pixels.
  static const double minCell = 4;

  /// The grid's rectangle in picture pixels — mapped onto the whole map.
  Rect get rect => Rect.fromLTWH(x, y, cols * cellW, rows * cellH);

  /// Whether squares are square within 0.5 %.
  bool get isSquare => (cellW - cellH).abs() <= 0.005 * max(cellW, cellH);

  /// How much taller than wide a square is, in percent (negative = wider).
  double get skewPercent => (cellH / cellW - 1) * 100;

  /// Whether this is [RasterGrid.whole] for its picture (within 0.01 px).
  bool get isWhole =>
      x.abs() < 0.01 &&
      y.abs() < 0.01 &&
      (cols * cellW - pictureW).abs() < 0.01 &&
      (rows * cellH - pictureH).abs() < 0.01;

  /// Whether the grid reaches past the picture by more than
  /// [edgeTolerance] of a square on some side (partial edge squares) — a
  /// line a hair outside the edge, as detection often finds, does not count.
  bool get hasPartialEdges {
    final tx = edgeTolerance * cellW, ty = edgeTolerance * cellH;
    return x < -tx ||
        y < -ty ||
        x + cols * cellW > pictureW + tx ||
        y + rows * cellH > pictureH + ty;
  }

  /// The same squares on a picture of [size] (scaled), e.g. a PDF page
  /// rendered at another resolution than the one the grid was set on.
  RasterGrid forPicture(Size size) {
    if ((size.width - pictureW).abs() < 0.5 &&
        (size.height - pictureH).abs() < 0.5) {
      return this;
    }
    final sx = size.width / pictureW, sy = size.height / pictureH;
    return RasterGrid(
      x: x * sx,
      y: y * sy,
      cellW: cellW * sx,
      cellH: cellH * sy,
      cols: cols,
      rows: rows,
      pictureW: size.width,
      pictureH: size.height,
    );
  }

  /// The same squares re-counted to cover the picture with whole squares
  /// only or with [partialEdges] (see [RasterGrid.fromLines]).
  RasterGrid recover({required bool partialEdges}) => RasterGrid.fromLines(
        lineX: x,
        lineY: y,
        cellW: cellW,
        cellH: cellH,
        picture: Size(pictureW, pictureH),
        partialEdges: partialEdges,
      );

  /// A copy with the given fields replaced. Changing the cell or the
  /// position keeps [cols]/[rows]; use [recover] to re-count afterwards.
  RasterGrid copyWith({
    double? x,
    double? y,
    double? cellW,
    double? cellH,
    int? cols,
    int? rows,
  }) =>
      RasterGrid(
        x: x ?? this.x,
        y: y ?? this.y,
        cellW: cellW ?? this.cellW,
        cellH: cellH ?? this.cellH,
        cols: cols ?? this.cols,
        rows: rows ?? this.rows,
        pictureW: pictureW,
        pictureH: pictureH,
      );

  /// The same grid with squares of [w] × [h] picture pixels, the
  /// top-left corner ([x], [y]) staying where it is — the editor's size
  /// steppers. Counts are kept; [recover] re-counts.
  RasterGrid withCell(double w, double h) =>
      copyWith(cellW: max(minCell, w), cellH: max(minCell, h));

  /// The grid stretched so the point that was at picture point [from] is
  /// now at [to], the top-left corner staying put — the editor's Stretch
  /// tool. An axis whose [from] lies less than [minLeverage] squares from
  /// the corner is left alone (too little leverage to be precise); with
  /// [square] both axes take the one with more leverage.
  RasterGrid stretched(Offset from, Offset to, {required bool square}) {
    final u = (from.dx - x) / cellW, v = (from.dy - y) / cellH;
    final canX = u.abs() >= minLeverage, canY = v.abs() >= minLeverage;
    var w = canX ? (to.dx - x) / u : cellW;
    var h = canY ? (to.dy - y) / v : cellH;
    if (square) {
      if (!canX && !canY) return this;
      final s = u.abs() >= v.abs() ? w : h;
      w = s;
      h = s;
    }
    return withCell(w, h);
  }

  /// Fewest squares between the top-left corner and the finger for the
  /// Stretch tool to change that axis.
  static const double minLeverage = 1.5;

  /// The grid through two grid corners the DM marked on the picture: [a],
  /// and [b] lying [nx] squares right and [ny] squares down of it (negative
  /// = left / up) — the editor's two-corner tool, the most precise way to
  /// set the square size (the error of each mark is divided by the count).
  ///
  /// With [square] one size fits both axes (least squares over both
  /// distances); otherwise each axis takes its own, and an axis with a
  /// count of 0 keeps [fallback]'s size. Lines run through [a]; the counts
  /// cover [picture] as [RasterGrid.fromLines] does. Returns `null` when
  /// both counts are 0.
  static RasterGrid? fromCorners({
    required Offset a,
    required Offset b,
    required int nx,
    required int ny,
    required bool square,
    required RasterGrid fallback,
    bool partialEdges = false,
  }) {
    if (nx == 0 && ny == 0) return null;
    final dx = (b.dx - a.dx).abs(), dy = (b.dy - a.dy).abs();
    final ax = nx.abs(), ay = ny.abs();
    double w, h;
    if (square) {
      w = h = (dx * ax + dy * ay) / (ax * ax + ay * ay);
    } else {
      w = ax > 0 ? dx / ax : fallback.cellW;
      h = ay > 0 ? dy / ay : fallback.cellH;
    }
    if (w < minCell || h < minCell) return null;
    return RasterGrid.fromLines(
      lineX: a.dx,
      lineY: a.dy,
      cellW: w,
      cellH: h,
      picture: Size(fallback.pictureW, fallback.pictureH),
      partialEdges: partialEdges,
    );
  }

  /// Counts between two grid corners [a] and [b] for the two-corner tool,
  /// signed (negative = [b] left of / above [a]).
  ///
  /// Free squares ([square] false): each axis rounded with the current
  /// [cellW] / [cellH]. Square squares: the pair whose two directions agree
  /// on one square size within 1 % ([cornersAgree]), and among those the
  /// one closest to the current size — so a wrong current size cannot give
  /// a pair that contradicts itself (17 × 12 vs 16 × 12). An axis shorter
  /// than half a square counts 0 and the other alone decides.
  (int, int) cornerCounts(Offset a, Offset b, {required bool square}) {
    final dx = b.dx - a.dx, dy = b.dy - a.dy;
    if (!square) return ((dx / cellW).round(), (dy / cellH).round());
    final guess = (cellW + cellH) / 2;
    final ax = dx.abs(), ay = dy.abs();
    if (ax < 0.5 * guess || ay < 0.5 * guess) {
      return ((dx / guess).round(), (dy / guess).round());
    }
    final long = max(ax, ay), short = min(ax, ay);
    int? bestLong, bestShort;
    var bestScore = double.infinity;
    for (var nl = 1; nl <= long / minCell; nl++) {
      final ns = (short * nl / long).round();
      if (ns < 1) continue;
      final cl = long / nl, cs = short / ns;
      if ((cl - cs).abs() / cl > 0.01) continue;
      final score = log(cl / guess).abs();
      if (score < bestScore) {
        bestScore = score;
        bestLong = nl;
        bestShort = ns;
      }
    }
    if (bestLong == null) return ((dx / guess).round(), (dy / guess).round());
    final (nx, ny) = ax >= ay ? (bestLong, bestShort!) : (bestShort!, bestLong);
    return (dx < 0 ? -nx : nx, dy < 0 ? -ny : ny);
  }

  /// The count on the other axis that agrees with [n] squares over
  /// [distance] for square squares across [otherDistance] (signed like
  /// [otherDistance]) — "down follows across" in the two-corner tool.
  static int followingCount(double distance, int n, double otherDistance) {
    if (n == 0 || distance.abs() < 1e-9) return 0;
    final c = (otherDistance.abs() * n.abs() / distance.abs()).round();
    return otherDistance < 0 ? -c : c;
  }

  /// The square sizes two corners imply per axis (`null` for an axis with a
  /// count of 0), and whether they agree within 1 %.
  static ({double? across, double? down, bool agree}) cornersAgree(
      Offset a, Offset b, int nx, int ny) {
    final across = nx == 0 ? null : (b.dx - a.dx).abs() / nx.abs();
    final down = ny == 0 ? null : (b.dy - a.dy).abs() / ny.abs();
    final agree = across == null ||
        down == null ||
        (across - down).abs() / max(across, down) <= 0.01;
    return (across: across, down: down, agree: agree);
  }

  /// [n] squares across the picture's width, stretched to fill it from the
  /// left edge (rows follow: square squares, or the old row height share
  /// when not [square]) — the editor's "squares across" stepper.
  RasterGrid acrossWidth(int n, {required bool square, bool partialEdges = false}) {
    final w = pictureW / max(1, n);
    final h = square ? w : pictureH / max(1, rows);
    return RasterGrid.fromLines(
        lineX: 0,
        lineY: 0,
        cellW: w,
        cellH: h,
        picture: Size(pictureW, pictureH),
        partialEdges: partialEdges);
  }

  /// Picture point of grid corner ([col], [row]) — col 0 is the left edge
  /// of the first column.
  Offset corner(num col, num row) => Offset(x + col * cellW, y + row * cellH);

  /// Fractional square coordinates of picture point [p] (inverse of
  /// [corner]).
  Offset toGrid(Offset p) => Offset((p.dx - x) / cellW, (p.dy - y) / cellH);

  /// Whether [other] describes the same squares within [eps] picture px.
  bool closeTo(RasterGrid other, {double eps = 0.005}) =>
      cols == other.cols &&
      rows == other.rows &&
      (x - other.x).abs() <= eps &&
      (y - other.y).abs() <= eps &&
      (cellW - other.cellW).abs() <= eps &&
      (cellH - other.cellH).abs() <= eps;

  /// JSON for the relay (`grid` / `rasterGrid`) and the map library.
  Map<String, dynamic> toJson() => {
        'x': x,
        'y': y,
        'w': cellW,
        'h': cellH,
        'cols': cols,
        'rows': rows,
        'pw': pictureW,
        'ph': pictureH,
      };

  /// Parses [toJson]'s output; `null` for `null` or anything malformed.
  static RasterGrid? fromJson(Object? json) {
    if (json is! Map) return null;
    double? d(String k) => (json[k] as num?)?.toDouble();
    final x = d('x'), y = d('y'), w = d('w'), h = d('h');
    final pw = d('pw'), ph = d('ph');
    final cols = (json['cols'] as num?)?.toInt();
    final rows = (json['rows'] as num?)?.toInt();
    if (x == null || y == null || w == null || h == null || pw == null ||
        ph == null || cols == null || rows == null) {
      return null;
    }
    if (w <= 0 || h <= 0 || cols < 1 || rows < 1 || pw <= 0 || ph <= 0) {
      return null;
    }
    return RasterGrid(
        x: x, y: y, cellW: w, cellH: h, cols: cols, rows: rows,
        pictureW: pw, pictureH: ph);
  }

  @override
  String toString() => 'RasterGrid($cols × $rows of '
      '${cellW.toStringAsFixed(2)} × ${cellH.toStringAsFixed(2)} px at '
      '${x.toStringAsFixed(2)}, ${y.toStringAsFixed(2)} on '
      '${pictureW.round()} × ${pictureH.round()})';
}
