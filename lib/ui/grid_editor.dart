import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show PointerScrollEvent;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../model/grid_detect.dart';
import '../model/raster_grid.dart';

// The DM panel's warm palette (dm_control_panel.dart / map_grid_dialog.dart).
const _bg = Color(0xFF1a1512);
const _panel = Color(0xFF221c17);
const _gold = Color(0xFFd4a76a);
const _goldDim = Color(0xFF8a7044);
const _border = Color(0xFF5a4a30);
const _ok = Colors.lightGreenAccent;

/// Line colours the DM cycles through so the grid stands out on any map.
const _lineColors = [
  Color(0xFF00E5FF), // cyan
  Color(0xFFFF2BD6), // magenta
  Color(0xFFFFEA00), // yellow
  Color(0xFF76FF03), // green
];

/// What a one-finger drag on the picture does in the [GridEditorPage].
enum GridTool {
  /// Pans the view (two fingers always pan and zoom, in every tool).
  look,

  /// Slides the whole grid.
  move,

  /// Stretches the squares: the top-left corner stays, the grid line under
  /// the finger follows it.
  stretch,

  /// Two marked grid corners and the count between them set the squares.
  corners,
}

/// Opens the grid editor full screen and returns the fitted grid, or `null`
/// when the DM leaves without applying.
///
/// The DM sees [pictureBytes] (PNG/JPG/WebP) with battlemap's squares drawn
/// over it, starting from [initial], and corrects them by hand: slide,
/// stretch, mark two corners, or step the square size by 1 / 0.1 / 0.01 px
/// and the position by 1 / 0.1 px — fine enough that a 60-square map ends
/// within a pixel. Undo / redo, a magnifier while dragging, jumps to the
/// picture's corners to check drift, ½ / ×2, square or free squares,
/// whole or partial edge squares, the TV table line (fits / pans) and
/// [detected] (or a fresh detection) to start over from.
///
/// [note] is shown under the readout (e.g. what applying does to the fog);
/// [countsNote] replaces it once the counts differ from [initial]'s.
///
/// See also:
/// - [RasterGrid] for the grid and the editing math.
/// - [showMapGridDialog], the quick count-only dialog that leads here.
Future<RasterGrid?> showGridEditor(
  BuildContext context, {
  required Uint8List pictureBytes,
  required RasterGrid initial,
  GridDetection? detected,
  int tableCols = 34,
  int tableRows = 19,
  String title = 'Fit the grid',
  String confirmLabel = 'Apply',
  String? note,
  String? countsNote,
}) {
  return Navigator.of(context).push<RasterGrid>(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => GridEditorPage(
      pictureBytes: pictureBytes,
      initial: initial,
      detected: detected,
      tableCols: tableCols,
      tableRows: tableRows,
      title: title,
      confirmLabel: confirmLabel,
      note: note,
      countsNote: countsNote,
    ),
  ));
}

/// The full-screen grid editor; open it with [showGridEditor].
class GridEditorPage extends StatefulWidget {
  /// The picture (encoded) the grid lies on.
  final Uint8List pictureBytes;

  /// The grid to start from (and to reset to).
  final RasterGrid initial;

  /// A grid found by [detectGridInPicture], offered as a starting point.
  final GridDetection? detected;

  /// The TV's table window in squares, for the "on the table" line.
  final int tableCols;

  /// See [tableCols].
  final int tableRows;

  /// App bar title.
  final String title;

  /// Label of the apply button.
  final String confirmLabel;

  /// Line under the readout, see [showGridEditor].
  final String? note;

  /// Line under the readout once the counts changed, see [showGridEditor].
  final String? countsNote;

  /// Creates the editor page; see [showGridEditor].
  const GridEditorPage({
    super.key,
    required this.pictureBytes,
    required this.initial,
    this.detected,
    this.tableCols = 34,
    this.tableRows = 19,
    this.title = 'Fit the grid',
    this.confirmLabel = 'Apply',
    this.note,
    this.countsNote,
  });

  @override
  State<GridEditorPage> createState() => GridEditorPageState();
}

/// State of [GridEditorPage]; public for widget tests ([grid], [tool]).
class GridEditorPageState extends State<GridEditorPage> {
  ui.Image? _image;
  String? _loadError;

  /// The grid as edited so far.
  late RasterGrid grid;
  final List<RasterGrid> _undo = [];
  final List<RasterGrid> _redo = [];

  /// Whether squares stay square (one size for both axes).
  late bool square;

  /// Whether the grid covers the whole picture with partial edge squares.
  late bool partialEdges;

  /// What a one-finger drag does.
  GridTool tool = GridTool.look;

  /// Nudge step for the position arrows, in picture pixels.
  double step = 1;

  int _colorIndex = 0;
  bool _boldLines = false;

  // View: screen = picture * _zoom + _pan.
  double _zoom = 1;
  Offset _pan = Offset.zero;
  Size _viewSize = Size.zero;
  bool _fitted = false;

  // Gesture bookkeeping.
  double _startZoom = 1;
  Offset _startPan = Offset.zero;
  Offset _startFocal = Offset.zero;
  RasterGrid? _gestureStartGrid;
  Offset? _gesturePicStart;
  bool _viewGesture = false;
  int? _dragMarker; // 0 = A, 1 = B
  // Fingers on the canvas now / most at once during this touch, and the
  // state when the touch began (restored when it turns into a pinch).
  int _pointers = 0;
  int _maxPointers = 0;
  ({
    RasterGrid grid,
    ({Offset? a, Offset? b, int nx, int ny, bool byHand}) marks,
    Offset pic,
  })? _touchStart;
  Offset? _loupeAt; // screen point of the finger while a loupe shows

  // Two-corner tool.
  Offset? _cornerA;
  Offset? _cornerB;
  int _nx = 0, _ny = 0;
  bool _countsByHand = false;

  final FocusNode _focus = FocusNode(debugLabel: 'grid editor');

  @override
  void initState() {
    super.initState();
    grid = widget.initial;
    square = widget.initial.isSquare;
    partialEdges = widget.initial.hasPartialEdges;
    _decode();
  }

  @override
  void dispose() {
    _image?.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _decode() async {
    try {
      // Up to 4096 px: sharp enough to place lines to a tenth of a pixel
      // of the original, without a 6000 px picture's full memory.
      final w = widget.initial.pictureW, h = widget.initial.pictureH;
      final shrink = max(w, h) > 4096 ? 4096 / max(w, h) : 1.0;
      final codec = await ui.instantiateImageCodec(widget.pictureBytes,
          targetWidth: shrink < 1 ? (w * shrink).round() : null,
          targetHeight: shrink < 1 ? (h * shrink).round() : null);
      final frame = await codec.getNextFrame();
      codec.dispose();
      if (!mounted) {
        frame.image.dispose();
        return;
      }
      setState(() => _image = frame.image);
    } catch (e) {
      if (mounted) setState(() => _loadError = '$e');
    }
  }

  Size get _picture => Size(grid.pictureW, grid.pictureH);

  // ─── editing ────────────────────────────────────────────

  /// Replaces the grid (re-counted for the edge setting) and records the
  /// old one for undo, unless [record] is false (a drag in progress).
  void setGrid(RasterGrid next, {bool record = true, RasterGrid? undoFrom}) {
    final counted = next.recover(partialEdges: partialEdges);
    final before = undoFrom ?? grid;
    setState(() {
      if (record && !before.closeTo(counted, eps: 1e-6)) {
        _undo.add(before);
        if (_undo.length > 200) _undo.removeAt(0);
        _redo.clear();
      }
      grid = counted;
      if (!_countsByHand) _autoCounts();
    });
  }

  void _undoOnce() {
    if (_undo.isEmpty) return;
    setState(() {
      _redo.add(grid);
      grid = _undo.removeLast();
    });
  }

  void _redoOnce() {
    if (_redo.isEmpty) return;
    setState(() {
      _undo.add(grid);
      grid = _redo.removeLast();
    });
  }

  void _setSize(double w, double h) => setGrid(grid.withCell(w, h));

  void _stepSize(double d, {bool? width}) {
    if (square || width == null) {
      final s = grid.cellW + d;
      _setSize(s, square ? s : grid.cellH + d);
    } else if (width) {
      _setSize(grid.cellW + d, grid.cellH);
    } else {
      _setSize(grid.cellW, grid.cellH + d);
    }
  }

  void _nudge(double dx, double dy) =>
      setGrid(grid.copyWith(x: grid.x + dx, y: grid.y + dy));

  void _setSquare(bool on) {
    setState(() => square = on);
    if (on && !grid.isSquare) {
      final s = (grid.cellW + grid.cellH) / 2;
      _setSize(s, s);
    }
  }

  void _setPartial(bool on) {
    setState(() => partialEdges = on);
    setGrid(grid);
  }

  Future<void> _detectAgain() async {
    _snack('Looking for a grid in the picture...');
    final d = await detectGridInPicture(widget.pictureBytes);
    if (!mounted) return;
    if (d == null) {
      _snack('No drawn grid found — fit it by hand.', color: Colors.orangeAccent);
      return;
    }
    _useDetected(d);
    _snack('Found ${d.cols} × ${d.rows} squares of ${d.cellPx.toStringAsFixed(2)} px.');
  }

  void _useDetected(GridDetection d) {
    final g = d.toRasterGrid(partialEdges: partialEdges).forPicture(_picture);
    setState(() => square = true);
    setGrid(g);
  }

  Future<void> _typeSize({bool? width}) async {
    final current = width == false ? grid.cellH : grid.cellW;
    final v = await _askNumber(
        width == null ? 'Square size (px)' : width ? 'Square width (px)' : 'Square height (px)',
        current);
    if (v == null || v < RasterGrid.minCell) return;
    if (square || width == null) {
      _setSize(v, square ? v : grid.cellH);
    } else if (width) {
      _setSize(v, grid.cellH);
    } else {
      _setSize(grid.cellW, v);
    }
  }

  Future<void> _typePosition() async {
    final x = await _askNumber('First vertical line at (px)', grid.x);
    if (x == null || !mounted) return;
    final y = await _askNumber('First horizontal line at (px)', grid.y);
    if (y == null) return;
    setGrid(grid.copyWith(x: x, y: y));
  }

  Future<double?> _askNumber(String label, double value) async {
    final c = TextEditingController(text: value.toStringAsFixed(2));
    final v = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _bg,
        title: Text(label, style: const TextStyle(color: _gold, fontSize: 16)),
        content: TextField(
          controller: c,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          style: const TextStyle(color: _gold, fontSize: 20),
          onSubmitted: (t) => Navigator.pop(ctx, double.tryParse(t.replaceAll(',', '.'))),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: _goldDim))),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _bg),
              onPressed: () =>
                  Navigator.pop(ctx, double.tryParse(c.text.replaceAll(',', '.'))),
              child: const Text('OK')),
        ],
      ),
    );
    c.dispose();
    return v;
  }

  // ─── two corners ────────────────────────────────────────

  void _autoCounts() {
    final a = _cornerA, b = _cornerB;
    if (a == null || b == null) return;
    final (nx, ny) = grid.cornerCounts(a, b, square: square);
    _nx = nx;
    _ny = ny;
  }

  /// Sets the across ([across] true) or down count; with square squares
  /// the other count follows so both directions agree on one size.
  void _setCount(bool across, int v) {
    final a = _cornerA, b = _cornerB;
    setState(() {
      _countsByHand = true;
      if (across) {
        _nx = v;
      } else {
        _ny = v;
      }
      if (!square || a == null || b == null) return;
      final dx = b.dx - a.dx, dy = b.dy - a.dy;
      final half = 0.5 * min(grid.cellW, grid.cellH);
      if (across && dy.abs() >= half) _ny = RasterGrid.followingCount(dx, _nx, dy);
      if (!across && dx.abs() >= half) _nx = RasterGrid.followingCount(dy, _ny, dx);
    });
  }

  void _applyCorners() {
    final a = _cornerA, b = _cornerB;
    if (a == null || b == null) return;
    final g = RasterGrid.fromCorners(
        a: a, b: b, nx: _nx, ny: _ny, square: square, fallback: grid,
        partialEdges: partialEdges);
    if (g == null) {
      _snack('Put the two corners at least one square apart.', color: Colors.orangeAccent);
      return;
    }
    setGrid(g);
  }

  void _clearCorners() => setState(() {
        _cornerA = null;
        _cornerB = null;
        _countsByHand = false;
      });

  // ─── view ───────────────────────────────────────────────

  Offset _toPic(Offset screen) => (screen - _pan) / _zoom;
  Offset _toScreen(Offset pic) => pic * _zoom + _pan;

  /// Where picture point [pic] is on the editor's canvas (for tests).
  @visibleForTesting
  Offset screenOf(Offset pic) => _toScreen(pic);

  void _fit() {
    if (_viewSize.isEmpty) return;
    final z = min(_viewSize.width / _picture.width, _viewSize.height / _picture.height) * 0.94;
    setState(() {
      _zoom = z;
      _pan = Offset((_viewSize.width - _picture.width * z) / 2,
          (_viewSize.height - _picture.height * z) / 2);
    });
  }

  /// Zooms so about six squares fill the view's shorter side, centred on
  /// picture point [p] — for checking alignment in one spot.
  void _lookAt(Offset p) {
    if (_viewSize.isEmpty) return;
    final z = (_viewSize.shortestSide / (6 * max(grid.cellW, grid.cellH)))
        .clamp(0.05, 40.0);
    setState(() {
      _zoom = z;
      _pan = Offset(_viewSize.width / 2, _viewSize.height / 2) - p * z;
    });
  }

  void _zoomBy(double f) {
    final c = Offset(_viewSize.width / 2, _viewSize.height / 2);
    final p = _toPic(c);
    setState(() {
      _zoom = (_zoom * f).clamp(0.02, 60.0);
      _pan = c - p * _zoom;
    });
  }

  // ─── gestures ───────────────────────────────────────────

  void _onScaleStart(ScaleStartDetails d) {
    _startZoom = _zoom;
    _startPan = _pan;
    _startFocal = d.localFocalPoint;
    // From where the finger touched down, not where the recogniser
    // noticed the drag: the grid follows the finger exactly.
    _gestureStartGrid = _touchStart?.grid ?? grid;
    _gesturePicStart = _touchStart?.pic ?? _toPic(d.localFocalPoint);
    _viewGesture = d.pointerCount >= 2 || _maxPointers >= 2 || tool == GridTool.look;
    _dragMarker = null;
    if (!_viewGesture && tool == GridTool.corners) {
      _dragMarker = _markerAt(d.localFocalPoint);
      if (_dragMarker == null) {
        // A new mark where the finger is; the third tap restarts.
        setState(() {
          if (_cornerA == null || (_cornerA != null && _cornerB != null)) {
            _cornerA = _gesturePicStart;
            _cornerB = null;
            _countsByHand = false;
            _dragMarker = 0;
          } else {
            _cornerB = _gesturePicStart;
            _dragMarker = 1;
            _autoCounts();
          }
        });
      }
    }
    if (!_viewGesture && tool != GridTool.look) {
      setState(() => _loupeAt = d.localFocalPoint);
    }
  }

  void _onScaleUpdate(ScaleUpdateDetails d) {
    if ((d.pointerCount >= 2 || _maxPointers >= 2) && !_viewGesture) {
      // A second finger joined ([_pointerDown] already undid the edit):
      // from here the touch moves the view.
      _viewGesture = true;
      _startZoom = _zoom;
      _startPan = _pan;
      _startFocal = d.localFocalPoint;
      setState(() {
        _loupeAt = null;
        _dragMarker = null;
      });
    }
    if (_viewGesture) {
      final focalPic = (_startFocal - _startPan) / _startZoom;
      final z = (_startZoom * d.scale).clamp(0.02, 60.0);
      setState(() {
        _zoom = z;
        _pan = d.localFocalPoint - focalPic * z;
      });
      return;
    }
    final start = _gestureStartGrid!;
    final picNow = _toPic(d.localFocalPoint);
    final from = _gesturePicStart!;
    switch (tool) {
      case GridTool.move:
        final delta = picNow - from;
        setGrid(start.copyWith(x: start.x + delta.dx, y: start.y + delta.dy),
            record: false);
      case GridTool.stretch:
        setGrid(start.stretched(from, picNow, square: square), record: false);
      case GridTool.corners:
        setState(() {
          if (_dragMarker == 0) _cornerA = picNow;
          if (_dragMarker == 1) _cornerB = picNow;
          if (!_countsByHand) _autoCounts();
        });
      case GridTool.look:
        break;
    }
    setState(() => _loupeAt = d.localFocalPoint);
  }

  void _onScaleEnd(ScaleEndDetails d) {
    // Edits are committed when the last finger lifts ([_pointerUp]): the
    // recogniser ends and restarts its gesture whenever a finger joins.
    setState(() {
      _loupeAt = null;
      _dragMarker = null;
    });
  }

  // ─── fingers ────────────────────────────────────────────
  // One touch = from the first finger down to the last finger up. Only a
  // one-finger touch edits; once a second finger lands, everything the
  // first one did is undone and the touch only moves the view.

  void _pointerDown(PointerDownEvent e) {
    _pointers++;
    if (_pointers == 1) {
      _maxPointers = 1;
      _touchStart = (
        grid: grid,
        marks: (a: _cornerA, b: _cornerB, nx: _nx, ny: _ny, byHand: _countsByHand),
        pic: _toPic(e.localPosition),
      );
      return;
    }
    if (_maxPointers == 1) _revertTouch();
    _maxPointers = max(_maxPointers, _pointers);
  }

  void _pointerUp(PointerEvent e) {
    if (_pointers == 0) return;
    _pointers--;
    if (_pointers > 0) return;
    final t = _touchStart;
    _touchStart = null;
    if (t != null && _maxPointers == 1 &&
        (tool == GridTool.move || tool == GridTool.stretch)) {
      final moved = !t.grid.closeTo(grid, eps: 1e-6);
      if (tool == GridTool.stretch && !moved) {
        final u = (t.pic.dx - t.grid.x) / t.grid.cellW;
        final v = (t.pic.dy - t.grid.y) / t.grid.cellH;
        if (u.abs() < RasterGrid.minLeverage && v.abs() < RasterGrid.minLeverage) {
          _snack('Start the stretch on a line farther from the top-left corner.',
              color: Colors.orangeAccent);
        }
      }
      setGrid(grid, undoFrom: t.grid); // the whole drag is one undo step
    }
    setState(() {
      _loupeAt = null;
      _dragMarker = null;
    });
  }

  /// Puts the grid and the marks back to where this touch found them.
  void _revertTouch() {
    final t = _touchStart;
    if (t == null) return;
    setState(() {
      grid = t.grid;
      _cornerA = t.marks.a;
      _cornerB = t.marks.b;
      _nx = t.marks.nx;
      _ny = t.marks.ny;
      _countsByHand = t.marks.byHand;
      _loupeAt = null;
      _dragMarker = null;
    });
  }

  int? _markerAt(Offset screen) {
    int? best;
    var bestD = 36.0;
    for (final (i, m) in [(0, _cornerA), (1, _cornerB)]) {
      if (m == null) continue;
      final dist = (_toScreen(m) - screen).distance;
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    }
    return best;
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
    final big = HardwareKeyboard.instance.isShiftPressed ? 10.0 : 1.0;
    final s = step * big;
    switch (e.logicalKey) {
      case LogicalKeyboardKey.arrowLeft:
        _nudge(-s, 0);
      case LogicalKeyboardKey.arrowRight:
        _nudge(s, 0);
      case LogicalKeyboardKey.arrowUp:
        _nudge(0, -s);
      case LogicalKeyboardKey.arrowDown:
        _nudge(0, s);
      case LogicalKeyboardKey.equal || LogicalKeyboardKey.add || LogicalKeyboardKey.numpadAdd:
        _stepSize(0.01 * big);
      case LogicalKeyboardKey.minus || LogicalKeyboardKey.numpadSubtract:
        _stepSize(-0.01 * big);
      default:
        return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  // ─── UI ─────────────────────────────────────────────────

  void _snack(String text, {Color color = _gold}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(text, style: TextStyle(color: color == _gold ? _bg : Colors.black)),
        backgroundColor: color,
        duration: const Duration(seconds: 3),
      ));
  }

  Future<void> _close() async {
    if (grid.closeTo(widget.initial, eps: 1e-6)) {
      Navigator.pop(context);
      return;
    }
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _bg,
        title: const Text('Leave without applying?', style: TextStyle(color: _gold)),
        content: const Text('Your changes to the grid are dropped.',
            style: TextStyle(color: _goldDim)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep editing', style: TextStyle(color: _goldDim))),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _bg),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Leave')),
        ],
      ),
    );
    if (leave == true && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final changed = !grid.closeTo(widget.initial, eps: 1e-6);
    return PopScope(
      canPop: !changed,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        backgroundColor: _bg,
        appBar: AppBar(
          backgroundColor: _panel,
          foregroundColor: _gold,
          title: Text(widget.title, style: const TextStyle(color: _gold, fontSize: 18)),
          leading: IconButton(
              tooltip: 'Close', icon: const Icon(Icons.close), onPressed: _close),
          actions: [
            IconButton(
                tooltip: 'Undo',
                icon: const Icon(Icons.undo),
                onPressed: _undo.isEmpty ? null : _undoOnce),
            IconButton(
                tooltip: 'Redo',
                icon: const Icon(Icons.redo),
                onPressed: _redo.isEmpty ? null : _redoOnce),
            IconButton(
                tooltip: 'Back to the start',
                icon: const Icon(Icons.restart_alt),
                onPressed: changed ? () => setGrid(widget.initial) : null),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _bg),
                icon: const Icon(Icons.check),
                label: Text(widget.confirmLabel),
                onPressed: () => Navigator.pop(context, grid),
              ),
            ),
            const SizedBox(width: 12),
          ],
        ),
        body: Focus(
          focusNode: _focus,
          autofocus: true,
          onKeyEvent: _onKey,
          child: wide
              ? Row(children: [
                  Expanded(child: _canvas()),
                  Container(width: 1, color: _border),
                  SizedBox(width: 360, child: _controls()),
                ])
              : Column(children: [
                  Expanded(flex: 5, child: _canvas()),
                  Container(height: 1, color: _border),
                  Expanded(flex: 4, child: _controls()),
                ]),
        ),
      ),
    );
  }

  Widget _canvas() {
    return LayoutBuilder(builder: (context, c) {
      _viewSize = c.biggest;
      if (!_fitted && _image != null && !_viewSize.isEmpty) {
        _fitted = true;
        WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
      }
      if (_loadError != null) {
        return Center(
            child: Text('Could not open the picture: $_loadError',
                style: const TextStyle(color: Colors.redAccent)));
      }
      if (_image == null) {
        return const Center(child: CircularProgressIndicator(color: _gold));
      }
      final painter = _GridPainter(
        image: _image!,
        grid: grid,
        zoom: _zoom,
        pan: _pan,
        lineColor: _lineColors[_colorIndex],
        bold: _boldLines,
        cornerA: tool == GridTool.corners ? _cornerA : null,
        cornerB: tool == GridTool.corners ? _cornerB : null,
      );
      return ClipRect(
        child: Listener(
          onPointerDown: _pointerDown,
          onPointerUp: _pointerUp,
          onPointerCancel: _pointerUp,
          onPointerSignal: (s) {
            if (s is PointerScrollEvent) {
              final p = _toPic(s.localPosition);
              setState(() {
                _zoom = (_zoom * (s.scrollDelta.dy > 0 ? 0.9 : 1.1)).clamp(0.02, 60.0);
                _pan = s.localPosition - p * _zoom;
              });
            }
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onScaleStart: _onScaleStart,
            onScaleUpdate: _onScaleUpdate,
            onScaleEnd: _onScaleEnd,
            child: Stack(children: [
              Positioned.fill(child: CustomPaint(painter: painter)),
              Positioned(
                left: 8,
                bottom: 8,
                child: _viewButtons(),
              ),
              if (_loupeAt != null) _loupe(_loupeAt!, painter),
            ]),
          ),
        ),
      );
    });
  }

  Widget _viewButtons() {
    Widget b(IconData i, String tip, VoidCallback f) => Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Material(
            color: _panel.withValues(alpha: 0.9),
            shape: const CircleBorder(side: BorderSide(color: _border)),
            child: IconButton(
                tooltip: tip, icon: Icon(i, color: _gold, size: 20), onPressed: f),
          ),
        );
    return Row(mainAxisSize: MainAxisSize.min, children: [
      b(Icons.zoom_in, 'Zoom in', () => _zoomBy(1.5)),
      b(Icons.zoom_out, 'Zoom out', () => _zoomBy(1 / 1.5)),
      b(Icons.fit_screen, 'Whole picture', _fit),
    ]);
  }

  /// A magnifier above the finger showing about one and a half squares
  /// around it (at least 1.5× the view) with a crosshair on the finger's
  /// picture point; the marks are left out so they do not hide the corner.
  Widget _loupe(Offset at, _GridPainter base) {
    const size = 170.0;
    final pic = _toPic(at);
    final z = max(_zoom * 1.5, size / (1.5 * max(grid.cellW, grid.cellH)))
        .clamp(0.05, 60.0)
        .toDouble();
    const center = Offset(size / 2, size / 2);
    final top = at.dy - size - 40 < 0 ? at.dy + 40 : at.dy - size - 40;
    final left = (at.dx - size / 2).clamp(0.0, max(0.0, _viewSize.width - size)).toDouble();
    return Positioned(
      left: left,
      top: top,
      width: size,
      height: size,
      child: IgnorePointer(
        child: Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: _gold, width: 2),
            boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 8)],
          ),
          child: ClipOval(
            child: CustomPaint(
              painter: base.copyWith(
                  zoom: z, pan: center - pic * z, crosshair: center, showMarks: false),
            ),
          ),
        ),
      ),
    );
  }

  Widget _controls() {
    return ColoredBox(
      color: _panel,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
        children: [
          _readout(),
          const SizedBox(height: 12),
          _section('Tool'),
          _toolPicker(),
          const SizedBox(height: 6),
          Text(_toolHint(), style: const TextStyle(color: _goldDim, fontSize: 12.5)),
          if (tool == GridTool.corners) ...[
            const SizedBox(height: 8),
            _cornerControls(),
          ],
          const SizedBox(height: 14),
          _section('Square size — top-left corner stays put'),
          if (square)
            _sizeRow(null)
          else ...[
            _sizeRow(true),
            const SizedBox(height: 4),
            _sizeRow(false),
          ],
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 6, children: [
            _chip('½ size', () => _setSize(grid.cellW / 2, grid.cellH / 2)),
            _chip('× 2 size', () => _setSize(grid.cellW * 2, grid.cellH * 2)),
            FilterChip(
              label: const Text('Square squares'),
              selected: square,
              onSelected: _setSquare,
              selectedColor: _gold.withValues(alpha: 0.3),
              checkmarkColor: _gold,
              labelStyle: const TextStyle(color: _gold),
              backgroundColor: _bg,
              side: const BorderSide(color: _border),
            ),
          ]),
          const SizedBox(height: 14),
          _section('Position — where the first lines are'),
          _positionControls(),
          const SizedBox(height: 14),
          _section('Squares across the picture'),
          _acrossRow(),
          const SizedBox(height: 14),
          _section('Edge squares'),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Whole only')),
              ButtonSegment(value: true, label: Text('Include partial')),
            ],
            selected: {partialEdges},
            onSelectionChanged: (s) => _setPartial(s.first),
            style: _segStyle(),
          ),
          const SizedBox(height: 4),
          Text(
              partialEdges
                  ? 'Slivers at the edges become squares too (dark where the picture ends).'
                  : 'Slivers at the edges are left off the table.',
              style: const TextStyle(color: _goldDim, fontSize: 12)),
          const SizedBox(height: 14),
          _section('Check the fit — zoom into'),
          Wrap(spacing: 8, runSpacing: 6, children: [
            _chip('Top left', () => _lookAt(grid.corner(0.5, 0.5))),
            _chip('Top right', () => _lookAt(grid.corner(grid.cols - 0.5, 0.5))),
            _chip('Centre', () => _lookAt(grid.corner(grid.cols / 2, grid.rows / 2))),
            _chip('Bottom left', () => _lookAt(grid.corner(0.5, grid.rows - 0.5))),
            _chip('Bottom right', () => _lookAt(grid.corner(grid.cols - 0.5, grid.rows - 0.5))),
            _chip('Whole picture', _fit),
          ]),
          const SizedBox(height: 4),
          const Text(
              'Lines drift toward the far corner when the size is off: align the top left '
              'with Position, then fix the bottom right with the size steppers or Stretch.',
              style: TextStyle(color: _goldDim, fontSize: 12)),
          const SizedBox(height: 14),
          _section('Start over from'),
          Wrap(spacing: 8, runSpacing: 6, children: [
            if (widget.detected != null)
              _chip('Detected ${widget.detected!.cols} × ${widget.detected!.rows}',
                  () => _useDetected(widget.detected!)),
            _chip('Detect again', _detectAgain),
            _chip('Whole picture, ${grid.cols} across',
                () => setGrid(grid.acrossWidth(grid.cols, square: square, partialEdges: partialEdges))),
          ]),
          const SizedBox(height: 14),
          _section('Lines'),
          Wrap(spacing: 8, runSpacing: 6, children: [
            ActionChip(
              avatar: CircleAvatar(backgroundColor: _lineColors[_colorIndex], radius: 7),
              label: const Text('Colour'),
              onPressed: () =>
                  setState(() => _colorIndex = (_colorIndex + 1) % _lineColors.length),
              backgroundColor: _bg,
              labelStyle: const TextStyle(color: _gold),
              side: const BorderSide(color: _border),
            ),
            FilterChip(
              label: const Text('Bold'),
              selected: _boldLines,
              onSelected: (v) => setState(() => _boldLines = v),
              selectedColor: _gold.withValues(alpha: 0.3),
              checkmarkColor: _gold,
              labelStyle: const TextStyle(color: _gold),
              backgroundColor: _bg,
              side: const BorderSide(color: _border),
            ),
          ]),
          const SizedBox(height: 10),
          const Text(
              'Keyboard: arrows move the grid (Shift = 10×), + and − change the size by 0.01 px.',
              style: TextStyle(color: _goldDim, fontSize: 11.5)),
        ],
      ),
    );
  }

  Widget _readout() {
    final g = grid;
    final fits = g.cols <= widget.tableCols && g.rows <= widget.tableRows;
    final fitsTurned = g.cols <= widget.tableRows && g.rows <= widget.tableCols;
    final table = fits
        ? 'Fits the TV (${widget.tableCols} × ${widget.tableRows}), centred.'
        : fitsTurned
            ? 'Fits the TV turned 90°, otherwise the TV pans.'
            : 'Bigger than the TV (${widget.tableCols} × ${widget.tableRows}): you pan it from the tablet.';
    final countsChanged =
        g.cols != widget.initial.cols || g.rows != widget.initial.rows;
    final note = countsChanged && widget.countsNote != null ? widget.countsNote : widget.note;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${g.cols} × ${g.rows} squares',
            key: const ValueKey('gridEditorCounts'),
            style: const TextStyle(color: _gold, fontSize: 22, fontWeight: FontWeight.w600)),
        const SizedBox(height: 2),
        Text(
            square
                ? 'Square ${g.cellW.toStringAsFixed(2)} px'
                : 'Square ${g.cellW.toStringAsFixed(2)} × ${g.cellH.toStringAsFixed(2)} px',
            key: const ValueKey('gridEditorSize'),
            style: const TextStyle(color: _gold, fontSize: 14)),
        Text('On the table: ${g.cols} × ${g.rows} in. $table',
            style: const TextStyle(color: _goldDim, fontSize: 12.5)),
        if (!g.isSquare && g.skewPercent.abs() > 0.5)
          Text(
              'Squares ${g.skewPercent.abs().toStringAsFixed(1)} % ${g.skewPercent > 0 ? 'taller' : 'wider'}'
              ' in the picture — the table shows them square.',
              style: const TextStyle(color: Colors.orangeAccent, fontSize: 12.5)),
        if (note != null) ...[
          const SizedBox(height: 4),
          Text(note,
              style: TextStyle(
                  color: countsChanged && widget.countsNote != null
                      ? Colors.orangeAccent
                      : _ok,
                  fontSize: 12.5)),
        ],
      ]),
    );
  }

  String _toolHint() => switch (tool) {
        GridTool.look => 'One finger pans, two fingers zoom — two fingers move the view in every tool.',
        GridTool.move => 'Drag to slide the grid onto the drawn lines. The magnifier shows the line under your finger.',
        GridTool.stretch => 'Drag a grid line far from the top-left corner: that corner stays, '
            'the line follows your finger. The farther out, the more precise.',
        GridTool.corners => 'Tap a grid corner, then another corner far away (opposite corners '
            'are best). Drag a mark to refine it with the magnifier, check the count, then use them.',
      };

  Widget _toolPicker() {
    Widget b(GridTool t, IconData icon, String label) {
      final on = tool == t;
      return SizedBox(
        height: 44,
        child: OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            backgroundColor: on ? _gold : _bg,
            foregroundColor: on ? _bg : _gold,
            side: const BorderSide(color: _border),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          icon: Icon(icon, size: 18),
          label: Text(label, overflow: TextOverflow.ellipsis),
          onPressed: () => setState(() => tool = t),
        ),
      );
    }

    return Column(children: [
      Row(children: [
        Expanded(child: b(GridTool.look, Icons.pan_tool_alt, 'Look')),
        const SizedBox(width: 6),
        Expanded(child: b(GridTool.move, Icons.open_with, 'Move grid')),
      ]),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(child: b(GridTool.stretch, Icons.open_in_full, 'Stretch')),
        const SizedBox(width: 6),
        Expanded(child: b(GridTool.corners, Icons.control_point, '2 corners')),
      ]),
    ]);
  }

  Widget _cornerControls() {
    final a = _cornerA, b = _cornerB;
    if (a == null || b == null) {
      return Text(a == null ? 'Mark 1: tap a grid corner.' : 'Mark 2: tap a far grid corner.',
          style: const TextStyle(color: _ok, fontSize: 13));
    }
    final sx = b.dx < a.dx ? -1 : 1, sy = b.dy < a.dy ? -1 : 1;
    Widget counter(String label, bool across, int value, int sign) => Row(children: [
          SizedBox(width: 92, child: Text(label, style: const TextStyle(color: _gold, fontSize: 13))),
          _iconBtn(Icons.remove, 'One square less $label',
              () => _setCount(across, sign * max(0, value.abs() - 1))),
          SizedBox(
              width: 44,
              child: Text('${value.abs()}',
                  key: ValueKey(across ? 'gridEditorAcross' : 'gridEditorDown'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: _gold, fontSize: 18))),
          _iconBtn(Icons.add, 'One square more $label',
              () => _setCount(across, sign * (value.abs() + 1))),
        ]);
    final implied = RasterGrid.cornersAgree(a, b, _nx, _ny);
    String px(double? v) => v == null ? '—' : '${v.toStringAsFixed(2)} px';
    final sizeLine = square && implied.agree
        ? 'Gives squares of ${px(implied.across ?? implied.down)}.'
        : 'Across gives ${px(implied.across)}, down gives ${px(implied.down)}.';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(
          square
              ? 'Squares from mark 1 to mark 2 (down follows across):'
              : 'Squares from mark 1 to mark 2:',
          style: const TextStyle(color: _goldDim, fontSize: 12.5)),
      counter('across', true, _nx, sx),
      counter('down', false, _ny, sy),
      const SizedBox(height: 4),
      Text(sizeLine,
          key: const ValueKey('gridEditorCornerSize'),
          style: const TextStyle(color: _gold, fontSize: 13)),
      if (square && !implied.agree)
        const Text(
            'The two directions disagree by more than 1 % — check the counts '
            '(or turn off "Square squares" for a photographed page).',
            style: TextStyle(color: Colors.orangeAccent, fontSize: 12.5)),
      const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 6, children: [
        FilledButton.icon(
          key: const ValueKey('gridEditorUseCorners'),
          style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _bg),
          icon: const Icon(Icons.check, size: 18),
          label: const Text('Use these corners'),
          onPressed: _applyCorners,
        ),
        TextButton(
            onPressed: _clearCorners,
            child: const Text('Clear marks', style: TextStyle(color: _goldDim))),
      ]),
    ]);
  }

  Widget _sizeRow(bool? width) {
    final v = width == false ? grid.cellH : grid.cellW;
    final label = width == null ? '' : width ? 'W ' : 'H ';
    Widget s(String t, double d) => _stepBtn(t, () => _stepSize(d, width: width));
    return Row(children: [
      s('−1', -1),
      s('−.1', -0.1),
      s('−.01', -0.01),
      Expanded(
        child: InkWell(
          onTap: () => _typeSize(width: width),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text('$label${v.toStringAsFixed(2)}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: _gold, fontSize: 17, fontWeight: FontWeight.w600)),
          ),
        ),
      ),
      s('+.01', 0.01),
      s('+.1', 0.1),
      s('+1', 1),
    ]);
  }

  Widget _positionControls() {
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      SizedBox(
        width: 132,
        height: 132,
        child: Stack(children: [
          Align(alignment: Alignment.topCenter, child: _iconBtn(Icons.keyboard_arrow_up, 'Grid up', () => _nudge(0, -step))),
          Align(alignment: Alignment.bottomCenter, child: _iconBtn(Icons.keyboard_arrow_down, 'Grid down', () => _nudge(0, step))),
          Align(alignment: Alignment.centerLeft, child: _iconBtn(Icons.keyboard_arrow_left, 'Grid left', () => _nudge(-step, 0))),
          Align(alignment: Alignment.centerRight, child: _iconBtn(Icons.keyboard_arrow_right, 'Grid right', () => _nudge(step, 0))),
        ]),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(
            onTap: _typePosition,
            child: Text('x ${grid.x.toStringAsFixed(2)}  y ${grid.y.toStringAsFixed(2)}',
                style: const TextStyle(color: _gold, fontSize: 14)),
          ),
          const SizedBox(height: 6),
          SegmentedButton<double>(
            segments: const [
              ButtonSegment(value: 1, label: Text('1 px')),
              ButtonSegment(value: 0.1, label: Text('0.1 px')),
            ],
            selected: {step},
            onSelectionChanged: (s) => setState(() => step = s.first),
            showSelectedIcon: false,
            style: _segStyle(),
          ),
          const SizedBox(height: 6),
          _chip('Lines on the picture edge', () => setGrid(grid.copyWith(x: 0, y: 0))),
        ]),
      ),
    ]);
  }

  Widget _acrossRow() {
    final n = grid.cols;
    void set(int v) =>
        setGrid(grid.acrossWidth(max(1, v), square: square, partialEdges: partialEdges));
    return Row(children: [
      _iconBtn(Icons.remove, 'One square less across', () => set(n - 1)),
      SizedBox(
          width: 56,
          child: Text('$n',
              textAlign: TextAlign.center,
              style: const TextStyle(color: _gold, fontSize: 18))),
      _iconBtn(Icons.add, 'One square more across', () => set(n + 1)),
      const SizedBox(width: 8),
      const Expanded(
          child: Text('Stretches the squares over the whole width, from the left edge.',
              style: TextStyle(color: _goldDim, fontSize: 12))),
    ]);
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(t.toUpperCase(),
            style: const TextStyle(
                color: _goldDim, fontSize: 11, letterSpacing: 0.8, fontWeight: FontWeight.w600)),
      );

  Widget _chip(String t, VoidCallback f) => ActionChip(
        label: Text(t),
        onPressed: f,
        backgroundColor: _bg,
        labelStyle: const TextStyle(color: _gold, fontSize: 13),
        side: const BorderSide(color: _border),
      );

  Widget _stepBtn(String t, VoidCallback f) => SizedBox(
        width: 44,
        height: 44,
        child: TextButton(
          style: TextButton.styleFrom(
            padding: EdgeInsets.zero,
            foregroundColor: _gold,
            backgroundColor: _bg,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: const BorderSide(color: _border)),
          ),
          onPressed: f,
          child: Text(t, style: const TextStyle(fontSize: 12)),
        ),
      );

  Widget _iconBtn(IconData i, String tip, VoidCallback f) => SizedBox(
        width: 44,
        height: 44,
        child: IconButton(
          tooltip: tip,
          style: IconButton.styleFrom(
            backgroundColor: _bg,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: const BorderSide(color: _border)),
          ),
          icon: Icon(i, color: _gold),
          onPressed: f,
        ),
      );

  ButtonStyle _segStyle() => ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? _bg : _gold),
        backgroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? _gold : _bg),
        side: const WidgetStatePropertyAll(BorderSide(color: _border)),
      );
}

/// Paints the picture, the grid over it (outside dimmed), the two corner
/// marks and — in the magnifier — a crosshair.
class _GridPainter extends CustomPainter {
  final ui.Image image;
  final RasterGrid grid;
  final double zoom;
  final Offset pan;
  final Color lineColor;
  final bool bold;
  final Offset? cornerA;
  final Offset? cornerB;
  final Offset? crosshair;
  final bool showMarks;

  _GridPainter({
    required this.image,
    required this.grid,
    required this.zoom,
    required this.pan,
    required this.lineColor,
    required this.bold,
    this.cornerA,
    this.cornerB,
    this.crosshair,
    this.showMarks = true,
  });

  _GridPainter copyWith({double? zoom, Offset? pan, Offset? crosshair, bool? showMarks}) =>
      _GridPainter(
        image: image,
        grid: grid,
        zoom: zoom ?? this.zoom,
        pan: pan ?? this.pan,
        lineColor: lineColor,
        bold: bold,
        cornerA: cornerA,
        cornerB: cornerB,
        crosshair: crosshair ?? this.crosshair,
        showMarks: showMarks ?? this.showMarks,
      );

  Offset _s(Offset p) => p * zoom + pan;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF0B0907));
    final pic = Rect.fromLTWH(pan.dx, pan.dy, grid.pictureW * zoom, grid.pictureH * zoom);
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      pic,
      // Crisp pixels when zoomed in: lines can be placed on the pixel.
      Paint()..filterQuality = zoom * grid.pictureW / image.width > 2.5
          ? FilterQuality.none
          : FilterQuality.medium,
    );

    final r = Rect.fromPoints(_s(grid.rect.topLeft), _s(grid.rect.bottomRight));
    // Dim what lies outside the grid (left off the table).
    final dim = Paint()..color = const Color(0xAA000000);
    final outside = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRect(r);
    canvas.drawPath(outside, dim);

    final line = Paint()
      ..color = lineColor.withValues(alpha: bold ? 0.95 : 0.8)
      ..strokeWidth = bold ? 2 : 1;
    final cw = grid.cellW * zoom, ch = grid.cellH * zoom;
    // Too dense to see: draw every k-th line only.
    final k = max(1, (6 / min(cw, ch)).ceil());
    final view = Offset.zero & size;
    final c0 = max(0, ((view.left - r.left) / cw).floor());
    final c1 = min(grid.cols, ((view.right - r.left) / cw).ceil());
    for (var c = c0; c <= c1; c++) {
      if (c % k != 0 && c != grid.cols) continue;
      final x = r.left + c * cw;
      canvas.drawLine(Offset(x, max(r.top, 0)), Offset(x, min(r.bottom, size.height)), line);
    }
    final r0 = max(0, ((view.top - r.top) / ch).floor());
    final r1 = min(grid.rows, ((view.bottom - r.top) / ch).ceil());
    for (var y = r0; y <= r1; y++) {
      if (y % k != 0 && y != grid.rows) continue;
      final yy = r.top + y * ch;
      canvas.drawLine(Offset(max(r.left, 0), yy), Offset(min(r.right, size.width), yy), line);
    }
    // The anchor: the top-left corner the size steppers keep.
    canvas.drawCircle(r.topLeft, 5, Paint()..color = lineColor);

    for (final (label, m) in [('1', cornerA), ('2', cornerB)]) {
      if (m == null || !showMarks) continue;
      final p = _s(m);
      final mark = Paint()
        ..color = Colors.white
        ..strokeWidth = 1.5
        ..style = PaintingStyle.stroke;
      canvas.drawCircle(p, 12, Paint()..color = const Color(0x66000000));
      canvas.drawCircle(p, 12, mark);
      canvas.drawLine(p - const Offset(18, 0), p + const Offset(18, 0), mark);
      canvas.drawLine(p - const Offset(0, 18), p + const Offset(0, 18), mark);
      final tp = TextPainter(
        text: TextSpan(
            text: label,
            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, p + const Offset(14, -26));
    }

    final ch2 = crosshair;
    if (ch2 != null) {
      final cross = Paint()
        ..color = Colors.white
        ..strokeWidth = 1;
      canvas.drawLine(ch2 - const Offset(14, 0), ch2 - const Offset(3, 0), cross);
      canvas.drawLine(ch2 + const Offset(3, 0), ch2 + const Offset(14, 0), cross);
      canvas.drawLine(ch2 - const Offset(0, 14), ch2 - const Offset(0, 3), cross);
      canvas.drawLine(ch2 + const Offset(0, 3), ch2 + const Offset(0, 14), cross);
    }
  }

  @override
  bool shouldRepaint(_GridPainter old) =>
      old.image != image ||
      !old.grid.closeTo(grid, eps: 1e-9) ||
      old.zoom != zoom ||
      old.pan != pan ||
      old.lineColor != lineColor ||
      old.bold != bold ||
      old.cornerA != cornerA ||
      old.cornerB != cornerB ||
      old.crosshair != crosshair ||
      old.showMarks != showMarks;
}
