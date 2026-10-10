import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'dart:ui';

/// A square grid found drawn into a picture map by [detectEmbeddedGrid].
///
/// All lengths are in the **original** picture's pixels, even when the
/// detection ran on a downscaled copy. Grid lines sit at
/// `offsetX + k * cellPx` (and `offsetY + k * cellPx`), measured in pixel
/// edges: 0 is the picture's left/top edge.
///
/// See also:
/// - `docs/architecture.md` "embedded grid detection" for the formula.
/// - [showMapGridDialog], which starts from [cols] × [rows].
class GridDetection {
  /// Side of one square in picture pixels (sub-pixel precise).
  final double cellPx;

  /// Position of the first vertical grid line, in `[0, cellPx)`.
  final double offsetX;

  /// Position of the first horizontal grid line, in `[0, cellPx)`.
  final double offsetY;

  /// How clearly the grid repeats: the weaker axis's normalized
  /// autocorrelation at [cellPx] (0..1; ≥ [minStrength] to be reported,
  /// a crisp digital grid scores 0.6–0.95, a faint one 0.3).
  final double strength;

  /// Whole squares across the part of the picture the grid covers ([crop]).
  final int cols;

  /// Whole squares down the part of the picture the grid covers ([crop]).
  final int rows;

  /// The picture's pixel size.
  final Size pictureSize;

  /// Creates a detection result; see [detectEmbeddedGrid].
  const GridDetection({
    required this.cellPx,
    required this.offsetX,
    required this.offsetY,
    required this.strength,
    required this.cols,
    required this.rows,
    required this.pictureSize,
  });

  /// The rectangle of whole squares in picture pixels: from the first grid
  /// line on each axis, [cols] × [rows] squares of [cellPx].
  ///
  /// Equal to the whole picture (within [edgeTolerance] of a square) when
  /// [aligned]; otherwise cropping the picture to it makes battlemap's
  /// `cols × rows` grid land exactly on the drawn one.
  Rect get crop {
    final x0 = _snapStart(offsetX);
    final y0 = _snapStart(offsetY);
    // A last square short by less than [edgeTolerance] still counts, so
    // clamp to the picture.
    return Rect.fromLTRB(x0, y0, min(x0 + cols * cellPx, pictureSize.width),
        min(y0 + rows * cellPx, pictureSize.height));
  }

  /// Whether the drawn grid meets the picture's edges in whole squares, so
  /// the picture can be used as is with [cols] × [rows] squares.
  bool get aligned {
    final c = crop;
    final tol = edgeTolerance * cellPx;
    return c.left <= tol &&
        c.top <= tol &&
        (pictureSize.width - c.right).abs() <= tol &&
        (pictureSize.height - c.bottom).abs() <= tol;
  }

  /// How far (as a fraction of a square) the grid may miss a picture edge
  /// and still count as [aligned].
  static const double edgeTolerance = 0.15;

  /// The weakest repetition reported as a grid (see [strength]).
  static const double minStrength = 0.25;

  /// A first line within [edgeTolerance] of a square after the edge is the
  /// edge itself (a line drawn on the border, partly cut off).
  double _snapStart(double offset) {
    final tol = edgeTolerance * cellPx;
    if (offset <= tol || cellPx - offset <= tol) return 0;
    return offset;
  }

  @override
  String toString() => 'GridDetection(${cellPx.toStringAsFixed(2)} px, '
      '$cols × $rows, offset ${offsetX.toStringAsFixed(1)}, '
      '${offsetY.toStringAsFixed(1)}, strength ${strength.toStringAsFixed(2)}'
      '${aligned ? '' : ', crop $crop'})';
}

/// Finds a square grid drawn into a picture map, or returns `null`.
///
/// [rgba] holds [width] × [height] pixels, 4 bytes each (straight RGBA,
/// what `Image.toByteData(format: ImageByteFormat.rawStraightRgba)` gives).
/// A picture larger than [maxSide] is box-averaged down by a whole factor
/// first (thin light lines fade but survive; sampling would lose them);
/// the result is in the original picture's pixels either way. Transparent
/// pixels count as white paper.
///
/// The formula, per axis (x shown; y is the same on rows):
/// 1. **Line profile** — `P(x) = Σ_y min(|L(x+1,y) − L(x,y)|, 24)`: how
///    much luminance changes between neighbouring columns, summed down the
///    picture. Grid lines run the whole height, so their columns add up;
///    the clip at 24 keeps thick walls and furniture outlines from drowning
///    faint grid lines.
/// 2. **High-pass** — subtract a 15-sample moving average, so only sharp
///    peaks remain, not lighting or the map's large shapes.
/// 3. **Period** — the normalized autocorrelation
///    `A(l) = Σ P(x)·P(x+l) / Σ P(x)²` peaks at the grid's spacing and its
///    multiples. Take the strongest local peak with `l` between the minimum
///    cell (20 original px) and a third of the picture, then prefer its
///    smallest whole fraction `l/d` (d = 2…6) that still reaches half its
///    strength — walls that repeat every two squares must not win.
///    Sub-pixel: a parabola through the peak, then the peak at the largest
///    multiple `k·l` still above half strength, divided by `k`.
/// 4. **Agreement** — both axes must find the same spacing within 3 % and
///    a strength ≥ [GridDetection.minStrength]; the cell is their mean.
///    Random texture almost never agrees on both axes.
/// 5. **Phase** — the circular mean of the profile around the cell:
///    `arg Σ P(x)·e^{2πi·x/cell}` gives where the lines sit, so a grid that
///    does not start at the picture's edge is cropped to whole squares
///    ([GridDetection.crop]).
///
/// Tuned on Juri's maps, the test maps (`test_assets/maps`) and the AI
/// pipeline's gridless pictures, which stone texture once fooled at 12 px.
///
/// See also:
/// - [GridDetection] for the result.
/// - `docs/architecture.md` "embedded grid detection".
GridDetection? detectEmbeddedGrid(
  Uint8List rgba,
  int width,
  int height, {
  int maxSide = 3072,
}) {
  if (width < 16 || height < 16 || rgba.length < width * height * 4) {
    return null;
  }
  // Box-average big pictures down by a whole factor: thin light lines
  // survive averaging (they fade), not sampling (they vanish).
  final f = max(1, (max(width, height) / maxSide).ceil());
  final pictureW = width.toDouble(), pictureH = height.toDouble();
  final lum = _luminance(rgba, width, height, f);
  final scale = f.toDouble();
  width ~/= f;
  height ~/= f;
  final px = _profile(lum, width, height, vertical: true);
  final py = _profile(lum, width, height, vertical: false);
  final minLag = max(8.0, _minCellOriginalPx / scale);
  final rx = _axisPeriod(px, minLag);
  final ry = _axisPeriod(py, minLag);
  if (rx == null || ry == null) return null;
  final agree = (rx.period - ry.period).abs() / max(rx.period, ry.period);
  final strength = min(rx.strength, ry.strength);
  if (agree > 0.03 || strength < GridDetection.minStrength) return null;

  final cell = (rx.period + ry.period) / 2;
  final ox = _phase(px, cell);
  final oy = _phase(py, cell);
  final cellPx = cell * scale;
  final tol = GridDetection.edgeTolerance;

  int whole(double offset, double length) {
    final o = offset * scale;
    final start = (o <= tol * cellPx || cellPx - o <= tol * cellPx) ? 0.0 : o;
    // A last square short by less than the tolerance still counts.
    return ((length - start) / cellPx + tol).floor();
  }

  final cols = whole(ox, pictureW);
  final rows = whole(oy, pictureH);
  if (cols < 2 || rows < 2) return null;
  return GridDetection(
    cellPx: cellPx,
    offsetX: ox * scale,
    offsetY: oy * scale,
    strength: strength,
    cols: cols,
    rows: rows,
    pictureSize: Size(pictureW, pictureH),
  );
}

/// Decodes a picture map ([bytes]: PNG/JPG/WebP) and runs
/// [detectEmbeddedGrid] on its pixels (averaged down to ≤ [maxSide] px;
/// 2048 lost the faint dashed grid of Dyson's 6000 px tavern).
///
/// Returns `null` when the picture has no grid or cannot be decoded. Runs
/// on the companion only (a 6000 px map briefly needs ~150 MB for its
/// pixels; the 2 GB TV box never runs it). Takes up to a few hundred ms,
/// so callers show progress.
///
/// See also:
/// - [GridDetection.crop] and [cropToGrid] for a grid that does not start
///   at the picture's edge.
Future<GridDetection?> detectGridInPicture(Uint8List bytes,
    {int maxSide = 3072}) async {
  ui.Codec? codec;
  ui.Image? image;
  try {
    codec = await ui.instantiateImageCodec(bytes);
    image = (await codec.getNextFrame()).image;
    final data =
        await image.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
    if (data == null) return null;
    return detectEmbeddedGrid(
        data.buffer.asUint8List(), image.width, image.height,
        maxSide: maxSide);
  } catch (_) {
    return null;
  } finally {
    image?.dispose();
    codec?.dispose();
  }
}

/// Cuts [bytes] (a decodable picture) down to [crop] and returns it as a
/// PNG, so a drawn grid that starts inside the picture lands on battlemap's
/// grid of `cols × rows` squares. `null` if the picture cannot be decoded.
///
/// See also:
/// - [GridDetection.crop], where [crop] comes from.
Future<Uint8List?> cropToGrid(Uint8List bytes, Rect crop) async {
  ui.Codec? codec;
  ui.Image? source;
  ui.Image? cut;
  try {
    codec = await ui.instantiateImageCodec(bytes);
    source = (await codec.getNextFrame()).image;
    final w = crop.width.round(), h = crop.height.round();
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawImageRect(source, crop,
        Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), Paint());
    final picture = recorder.endRecording();
    cut = await picture.toImage(w, h);
    picture.dispose();
    final png = await cut.toByteData(format: ui.ImageByteFormat.png);
    return png?.buffer.asUint8List();
  } catch (_) {
    return null;
  } finally {
    cut?.dispose();
    source?.dispose();
    codec?.dispose();
  }
}

/// Smallest square the detector reports, in original picture pixels.
/// Finer periods are stone or wood texture, and a map that coarse would be
/// useless at one inch per square anyway.
const double _minCellOriginalPx = 20;

/// Luminance 0..255 per pixel, transparent pixels blended onto white,
/// averaged over [f] × [f] blocks (remainder rows/columns dropped).
Float32List _luminance(Uint8List rgba, int w, int h, int f) {
  final ow = w ~/ f, oh = h ~/ f;
  final out = Float32List(ow * oh);
  final norm = 1.0 / (f * f);
  for (var oy = 0; oy < oh; oy++) {
    for (var sy = oy * f; sy < oy * f + f; sy++) {
      var p = sy * w * 4;
      var o = oy * ow;
      for (var ox = 0; ox < ow; ox++, o++) {
        var sum = 0.0;
        for (var k = 0; k < f; k++, p += 4) {
          final a = rgba[p + 3] / 255.0;
          final y = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
          sum += y * a + 255 * (1 - a);
        }
        out[o] += sum * norm;
      }
    }
  }
  return out;
}

/// Step 1 + 2 of [detectEmbeddedGrid]: the clipped edge profile across the
/// lines that run [vertical]ly (or horizontally), high-passed and lightly
/// blurred. Sample `i`
/// sits on pixel edge `i + 1`.
Float64List _profile(Float32List lum, int w, int h, {required bool vertical}) {
  const clip = 24.0;
  final n = vertical ? w - 1 : h - 1;
  final p = Float64List(n);
  if (vertical) {
    for (var y = 0; y < h; y++) {
      final row = y * w;
      for (var x = 0; x < n; x++) {
        final d = (lum[row + x + 1] - lum[row + x]).abs();
        p[x] += d < clip ? d : clip;
      }
    }
  } else {
    for (var y = 0; y < n; y++) {
      final a = y * w, b = a + w;
      var s = 0.0;
      for (var x = 0; x < w; x++) {
        final d = (lum[b + x] - lum[a + x]).abs();
        s += d < clip ? d : clip;
      }
      p[y] = s;
    }
  }
  // High-pass: minus a centred 15-sample moving average; near the ends the
  // average covers only the samples that exist (zero padding would leave
  // spikes at the picture's edges that pull the phase).
  const half = 7;
  final out = Float64List(n);
  var win = 0.0;
  var count = 0;
  for (var i = 0; i < half && i < n; i++) {
    win += p[i];
    count++;
  }
  for (var i = 0; i < n; i++) {
    final add = i + half;
    if (add < n) {
      win += p[add];
      count++;
    }
    final drop = i - half - 1;
    if (drop >= 0) {
      win -= p[drop];
      count--;
    }
    out[i] = p[i] - win / count;
  }
  // A light [1 2 3 2 1] blur: lines of different widths (a thick major line
  // every fifth square, thin ones between) then still overlap when shifted
  // by one square, which the autocorrelation needs.
  final blurred = Float64List(n);
  const taps = [1.0, 2.0, 3.0, 2.0, 1.0];
  for (var i = 0; i < n; i++) {
    var s = 0.0, wsum = 0.0;
    for (var t = -2; t <= 2; t++) {
      final j = i + t;
      if (j < 0 || j >= n) continue;
      s += out[j] * taps[t + 2];
      wsum += taps[t + 2];
    }
    blurred[i] = s / wsum;
  }
  return blurred;
}

/// Step 3 of [detectEmbeddedGrid] on one axis's profile.
({double period, double strength})? _axisPeriod(Float64List p, double minLag) {
  final n = p.length;
  final maxLag = n ~/ 3;
  final lo = minLag.ceil();
  if (maxLag <= lo + 2) return null;
  var mean = 0.0;
  for (final v in p) {
    mean += v;
  }
  mean /= n;
  final q = Float64List(n);
  for (var i = 0; i < n; i++) {
    q[i] = p[i] - mean;
  }
  // Autocorrelation up to the lags step 3's refinement needs.
  final lags = min(n - 1, (n * 0.6).ceil() + 3);
  final ac = Float64List(lags + 1);
  for (var l = 0; l <= lags; l++) {
    var s = 0.0;
    for (var i = 0; i + l < n; i++) {
      s += q[i] * q[i + l];
    }
    ac[l] = s;
  }
  if (ac[0] <= 0) return null;
  for (var l = lags; l >= 0; l--) {
    ac[l] /= ac[0];
  }

  final peaks = <int>[
    for (var l = max(lo, 1); l < maxLag && l < lags; l++)
      if (ac[l] > ac[l - 1] && ac[l] >= ac[l + 1]) l,
  ];
  if (peaks.isEmpty) return null;
  var best = peaks.reduce((a, b) => ac[a] >= ac[b] ? a : b);
  for (var d = 6; d >= 2; d--) {
    final c = best / d;
    if (c < 4) continue;
    // Fractions below the minimum cell are looked at too: a strong one
    // means the repetition is texture finer than any grid (bricks at 12 px
    // also repeat at 24) → no grid on this axis.
    var l = -1;
    for (var t = max(2, (c - 1.5).ceil()); t <= c + 1.5 && t < lags; t++) {
      if (ac[t] > ac[t - 1] && ac[t] >= ac[t + 1] && (l < 0 || ac[t] > ac[l])) {
        l = t;
      }
    }
    if (l < 0 || ac[l] < 0.5 * ac[best]) continue;
    if (l < minLag) return null;
    best = l;
    break;
  }
  final strength = ac[best];
  final p0 = _parabola(ac, best);
  var period = p0;
  for (var k = 2; k * p0 < n * 0.6; k++) {
    final c = (k * p0).round();
    if (c + 3 > lags) break;
    var j = c - 2;
    for (var t = c - 1; t <= c + 2; t++) {
      if (ac[t] > ac[j]) j = t;
    }
    if (ac[j] < 0.5 * strength) break;
    period = _parabola(ac, j) / k;
  }
  return (period: period, strength: strength);
}

/// Sub-sample position of the peak at [l] from a parabola through its
/// neighbours.
double _parabola(Float64List ac, int l) {
  final a = ac[l - 1], b = ac[l], c = ac[l + 1];
  final den = a - 2 * b + c;
  return den == 0 ? l.toDouble() : l + 0.5 * (a - c) / den;
}

/// Step 5 of [detectEmbeddedGrid]: where the lines sit, as a pixel-edge
/// position in `[0, cell)`.
double _phase(Float64List p, double cell) {
  var re = 0.0, im = 0.0;
  for (var i = 0; i < p.length; i++) {
    final w = p[i];
    if (w <= 0) continue;
    final a = 2 * pi * (i + 1) / cell;
    re += w * cos(a);
    im += w * sin(a);
  }
  final ang = atan2(im, re);
  final o = (ang < 0 ? ang + 2 * pi : ang) / (2 * pi) * cell;
  return o >= cell ? 0 : o;
}
