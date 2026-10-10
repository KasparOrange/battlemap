import 'dart:math';
import 'dart:ui';

/// How the TV frames the map.
///
/// Synced in `vtt.fullState` (`tvCameraMode`) and saved with the session.
///
/// See also:
/// - [TableLayout], which computes the camera for [table].
/// - `docs/architecture.md` "table view".
enum TvCameraMode {
  /// One map square = one physical inch. The TV shows a window of whole
  /// squares ([TableGrid.cols] × [TableGrid.rows], 34 × 19 on Konrad's TV),
  /// centred on the screen with the leftover split evenly on both sides;
  /// a map bigger than the window is panned in whole squares from the
  /// tablet. The default — the table's optimal result for every map.
  table,

  /// The whole map on the screen (an overview for the players). Squares are
  /// not one inch here.
  fit,

  /// Any other camera: zoomed with + / −, or a view sent from the tablet
  /// while not in [table].
  free;

  /// Parses a mode name; unknown or `null` names give [table].
  static TvCameraMode fromName(String? name) => TvCameraMode.values.firstWhere(
        (m) => m.name == name,
        orElse: () => TvCameraMode.table,
      );
}

/// The table: how many whole one-inch squares the TV screen holds and where
/// they sit.
///
/// Built from the screen's size in logical pixels and the physical width of
/// the picture ([screenWidthInches], a TV-wide calibration, not a per-game
/// one). The window of [cols] × [rows] squares is centred, so the leftover
/// (less than one square per axis) is split evenly between both edges.
///
/// Measured 2026-10-10 on Konrad's TV: 34 × 19 squares of one inch fit, with
/// a bit of gap both ways — [defaultScreenWidthInches] reproduces that until
/// the TV is calibrated with the measuring bar (companion ▸ Map ▸ Table
/// scale).
class TableGrid {
  /// Physical picture width assumed before calibration, in inches.
  ///
  /// 34.5 in on a 16:9 picture is 19.4 in tall → 34 × 19 one-inch squares
  /// with about ¼ in to spare on each side — Konrad's measured result.
  static const double defaultScreenWidthInches = 34.5;

  /// Plausible range for [screenWidthInches] (a 13" to a 100" screen).
  static const double minScreenWidthInches = 10;

  /// Upper end of the plausible range, see [minScreenWidthInches].
  static const double maxScreenWidthInches = 90;

  /// Length of the calibration pattern's measuring bar in inches (shorter
  /// on a screen with fewer squares).
  static const int measuringBarInches = 10;

  /// Screen size in logical pixels.
  final Size screen;

  /// Physical width of the screen's picture in inches.
  final double screenWidthInches;

  /// Logical pixels per physical inch (`screen.width / screenWidthInches`).
  final double pxPerInch;

  /// Whole one-inch squares across the screen.
  final int cols;

  /// Whole one-inch squares down the screen.
  final int rows;

  const TableGrid._(this.screen, this.screenWidthInches, this.pxPerInch,
      this.cols, this.rows);

  /// The table for a [screen] (logical px) whose picture is
  /// [screenWidthInches] wide. Returns `null` for an empty screen or a
  /// non-positive width.
  static TableGrid? of(Size screen, double screenWidthInches) {
    if (screen.width <= 0 || screen.height <= 0 || screenWidthInches <= 0) {
      return null;
    }
    final ppi = screen.width / screenWidthInches;
    // A hair of tolerance so 34.0 inches of picture still count 34 squares.
    final cols = max(1, (screen.width / ppi + 1e-6).floor());
    final rows = max(1, (screen.height / ppi + 1e-6).floor());
    return TableGrid._(screen, screenWidthInches, ppi, cols, rows);
  }

  /// Physical height of the picture in inches.
  double get screenHeightInches => screen.height / pxPerInch;

  /// The window of whole squares on the screen, centred (logical px).
  Rect get window {
    final w = cols * pxPerInch;
    final h = rows * pxPerInch;
    return Rect.fromLTWH(
        (screen.width - w) / 2, (screen.height - h) / 2, w, h);
  }

  /// Leftover on the left and on the right edge, in inches (each side).
  double get marginXInches => (screen.width / pxPerInch - cols) / 2;

  /// Leftover on the top and on the bottom edge, in inches (each side).
  double get marginYInches => (screen.height / pxPerInch - rows) / 2;
}

/// The TV camera for [TvCameraMode.table]: one square = one inch, the
/// window's edges on square boundaries.
///
/// Per axis of the map: when the map fits the window it is centred on the
/// screen; when it is bigger the window shows [winCols] (or [winRows])
/// whole squares starting at [col] (or [row]), clamped to the map. The
/// window turns with the camera: at 90° or 270° the screen's 34 columns run
/// down the map, so [winCols] is the screen's rows.
///
/// Pure arithmetic, no Flame — the TV game ([VttGame]) applies it and the
/// tablet uses the same numbers to draw the players' frame.
class TableLayout {
  /// Camera zoom: screen px per map px (`pxPerInch / cellPx`).
  final double zoom;

  /// Camera centre in map pixels.
  final Offset center;

  /// Map pixels per square.
  final double cellPx;

  /// Window width along the map's x axis, in squares.
  final int winCols;

  /// Window height along the map's y axis, in squares.
  final int winRows;

  /// First map column in the window (clamped). On an axis that does not
  /// pan ([pansX] false) the centred value, rounded.
  final int col;

  /// First map row in the window, see [col].
  final int row;

  /// Whether the map is wider than the window (the TV pans across it).
  final bool pansX;

  /// Whether the map is taller than the window.
  final bool pansY;

  const TableLayout._({
    required this.zoom,
    required this.center,
    required this.cellPx,
    required this.winCols,
    required this.winRows,
    required this.col,
    required this.row,
    required this.pansX,
    required this.pansY,
  });

  /// Lays a map of [mapCols] × [mapRows] squares of [cellPx] map pixels on
  /// [grid], with the camera turned by [quarterTurns] × 90°.
  ///
  /// [col] / [row] ask for the window's first square; `null` centres the
  /// window on the map. Out-of-range requests are clamped.
  factory TableLayout.compute({
    required TableGrid grid,
    required int mapCols,
    required int mapRows,
    required double cellPx,
    int quarterTurns = 0,
    int? col,
    int? row,
  }) {
    final sideways = quarterTurns.isOdd;
    final winCols = sideways ? grid.rows : grid.cols;
    final winRows = sideways ? grid.cols : grid.rows;
    final x = _axis(mapCols, winCols, col);
    final y = _axis(mapRows, winRows, row);
    return TableLayout._(
      zoom: grid.pxPerInch / cellPx,
      center: Offset(x.center * cellPx, y.center * cellPx),
      cellPx: cellPx,
      winCols: winCols,
      winRows: winRows,
      col: x.start,
      row: y.start,
      pansX: x.pans,
      pansY: y.pans,
    );
  }

  /// One axis: window start (squares) and centre (squares).
  static ({int start, double center, bool pans}) _axis(
      int mapLen, int winLen, int? start) {
    if (mapLen <= winLen) {
      // Map fits: centred, the window hangs over both ends evenly.
      return (start: ((mapLen - winLen) / 2).round(), center: mapLen / 2, pans: false);
    }
    final s = (start ?? ((mapLen - winLen) / 2).round()).clamp(0, mapLen - winLen);
    return (start: s, center: s + winLen / 2, pans: true);
  }

  /// Whether the TV has anything to pan (the map exceeds the window on at
  /// least one axis).
  bool get pans => pansX || pansY;

  /// The window in map squares (may reach past the map where it fits).
  Rect get windowSquares => Rect.fromCenter(
        center: center / cellPx,
        width: winCols.toDouble(),
        height: winRows.toDouble(),
      );

  /// Window start that centres the window on [centerSquares] (map
  /// squares), rounded to whole squares; clamping happens in [compute].
  ({int col, int row}) startFor(Offset centerSquares) => (
        col: (centerSquares.dx - winCols / 2).round(),
        row: (centerSquares.dy - winRows / 2).round(),
      );
}

/// Quarter turns (0–3) of a camera angle in radians, rounded to the nearest
/// 90°.
int quarterTurnsOf(double angle) => ((angle / (pi / 2)).round() % 4 + 4) % 4;

/// What a game file records about how its map goes on the table: the map's
/// scale, the TV calibration it was computed for, whether the whole map
/// fits the table, and whether battlemap draws its own grid.
///
/// Written by the TV into every saved [Session] (`mapFit`) — informational:
/// the TV recomputes the scale from the current calibration on load, so a
/// recalibrated TV stays exact. Konrad's ask (2026-10-10): "save in the
/// files that define that game in what scale we have to put that map and if
/// we have to draw a grid ourselves".
class MapFit {
  /// Map pixels per square.
  final double cellPx;

  /// Map size in squares.
  final int cols;

  /// Map size in squares.
  final int rows;

  /// TV zoom that makes one square exactly one inch (`pxPerInch / cellPx`).
  final double tvZoom;

  /// The TV calibration: physical picture width in inches.
  final double screenWidthInches;

  /// Logical TV pixels per inch at that calibration.
  final double pxPerInch;

  /// Whole squares the table window holds (34 × 19 on Konrad's TV).
  final int tableCols;

  /// See [tableCols].
  final int tableRows;

  /// Whether battlemap draws its grid over the map (`false` when the
  /// picture has grid lines of its own).
  final bool drawGrid;

  /// Creates a record. See the fields.
  const MapFit({
    required this.cellPx,
    required this.cols,
    required this.rows,
    required this.tvZoom,
    required this.screenWidthInches,
    required this.pxPerInch,
    required this.tableCols,
    required this.tableRows,
    required this.drawGrid,
  });

  /// Builds the record for a map of [cols] × [rows] squares of [cellPx] on
  /// [grid].
  factory MapFit.of(TableGrid grid,
          {required double cellPx,
          required int cols,
          required int rows,
          required bool drawGrid}) =>
      MapFit(
        cellPx: cellPx,
        cols: cols,
        rows: rows,
        tvZoom: grid.pxPerInch / cellPx,
        screenWidthInches: grid.screenWidthInches,
        pxPerInch: grid.pxPerInch,
        tableCols: grid.cols,
        tableRows: grid.rows,
        drawGrid: drawGrid,
      );

  /// Whether the whole map fits the table window unturned (no panning).
  bool get fitsTable => cols <= tableCols && rows <= tableRows;

  /// Serializes to the session's `mapFit` object.
  Map<String, dynamic> toJson() => {
        'cellPx': cellPx,
        'cols': cols,
        'rows': rows,
        'tvZoom': tvZoom,
        'screenWidthInches': screenWidthInches,
        'pxPerInch': pxPerInch,
        'tableCols': tableCols,
        'tableRows': tableRows,
        'fitsTable': fitsTable,
        'drawGrid': drawGrid,
      };

  /// Parses a `mapFit` object written by [toJson].
  factory MapFit.fromJson(Map<String, dynamic> json) => MapFit(
        cellPx: (json['cellPx'] as num).toDouble(),
        cols: (json['cols'] as num).toInt(),
        rows: (json['rows'] as num).toInt(),
        tvZoom: (json['tvZoom'] as num).toDouble(),
        screenWidthInches: (json['screenWidthInches'] as num).toDouble(),
        pxPerInch: (json['pxPerInch'] as num).toDouble(),
        tableCols: (json['tableCols'] as num).toInt(),
        tableRows: (json['tableRows'] as num).toInt(),
        drawGrid: json['drawGrid'] as bool? ?? true,
      );
}
