import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';
import 'package:flutter/animation.dart' show Curves;

import '../../model/uvtt_map.dart';
import '../../state/vtt_state.dart';

/// Renders one door/portal of the map.
///
/// Two looks, chosen per map by [UvttMap.drawDoors]:
/// - **marker** (default — Dungeondraft maps paint their doors into the
///   image): a small box over the doorway, orange when closed, green when open.
///   DM-only ([showMarker]): the TV draws nothing, the map's own painted door
///   is what the players see.
/// - **drawn door** (AI maps from `tools/mapgen`, whose image shows empty
///   doorways): a top-down wooden door leaf in the wall line that swings
///   open around its hinge at `bounds[0]` and shut again ([DoorSwing]).
///   It always opens to the south of an east–west wall and to the east of a
///   north–south wall ([swingSign]), so the two leaves of a double door
///   (hinges at the outer ends, written so by `tools/mapgen`) open together.
///   On the players' display ([forPlayers]) a drawn door sits **above** the
///   fog, so a door opened into a still-fogged room stays visible; it is drawn
///   only while the fog is off or a square beside the doorway is revealed
///   ([visibleToPlayers]), so doors deep in the fog don't give rooms away.
///
/// Input handling (tap-to-toggle) is in VttGame's input router.
///
/// See also:
/// * [UvttPortal], the door geometry from the `.dd2vtt` file.
/// * [VttState.openPortals], the runtime open/closed state read by [isOpen].
class PortalComponent extends PositionComponent {
  /// Index of this portal in [UvttMap.portals] (the key in [VttState.openPortals]).
  final int portalIndex;

  /// The door geometry: [UvttPortal.bounds] in grid coordinates.
  final UvttPortal portal;

  /// The shared game state; [isOpen] reads [VttState.openPortals].
  final VttState state;

  /// Image pixels per grid square, to turn grid coordinates into world pixels.
  final int pixelsPerGrid;

  /// Whether this portal renders as a drawn door instead of the marker,
  /// taken from [UvttMap.drawDoors] of the map loaded at construction.
  final bool drawn;

  /// Whether the marker look is drawn at all — `true` on the DM's tablet,
  /// `false` on the players' display (the TV), where the coloured boxes over
  /// the painted doors only distracted. Drawn doors ignore it: they are the
  /// door itself and show everywhere.
  final bool showMarker;

  /// Whether this door is drawn on the players' display (the TV) — then a
  /// drawn door renders above the fog (priority [abovePlayersFogPriority])
  /// and only when [visibleToPlayers]. `false` on the DM's tablet, whose
  /// fog is see-through anyway.
  final bool forPlayers;

  /// Render priority of a drawn door on the players' display: above the fog
  /// (10), below the DM layers (12).
  static const int abovePlayersFogPriority = 11;

  /// Fog cell indices (`row * cols + col`) on both sides of the doorway —
  /// a square of either side revealed makes the door visible to players.
  late final List<int> _sideCells;

  static const double _padding = 8.0;

  // Cached paints — marker
  final Paint _closedPaint = Paint()..color = const Color(0xFFAA4400);
  final Paint _openPaint = Paint()..color = const Color(0xFF00AA00);
  final Paint _borderPaint = Paint()
    ..color = const Color(0x88FFFFFF)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.0;

  // Drawn door: hinge, wall direction and leaf shape in world pixels
  late final Offset _hinge;
  late final double _wallAngle;
  late final double _swingSign;
  late final Rect _leaf;
  late final List<Rect> _straps;
  late final double _grain;
  late final double _pinRadius;
  late final Offset _shadowOffset;
  late final DoorSwing _swing;

  // Cached paints — drawn door (stroke widths set from the square size)
  final Paint _woodPaint = Paint()..color = const Color(0xFF6E4B2C);
  final Paint _grainPaint = Paint()
    ..color = const Color(0xFF5A3B20)
    ..style = PaintingStyle.stroke;
  final Paint _edgePaint = Paint()
    ..color = const Color(0xFF2F1F12)
    ..style = PaintingStyle.stroke;
  final Paint _ironPaint = Paint()..color = const Color(0xFF3A3A3C);
  final Paint _shadowPaint = Paint()..color = const Color(0x66000000);

  /// Creates the component for portal [portalIndex] of the map in [state].
  ///
  /// Position and size are the doorway's bounding box (plus padding), in
  /// world pixels; [pixelsPerGrid] converts the grid-coordinate [portal].
  /// [showMarker] hides the marker look on the players' display;
  /// [forPlayers] lifts a drawn door above the players' fog.
  PortalComponent({
    required this.portalIndex,
    required this.portal,
    required this.state,
    required this.pixelsPerGrid,
    this.showMarker = true,
    this.forPlayers = false,
  })  : drawn = state.map?.drawDoors ?? false,
        super(
            priority: forPlayers && (state.map?.drawDoors ?? false)
                ? abovePlayersFogPriority
                : 6) {
    // Compute position and size from portal bounds
    final ppg = pixelsPerGrid.toDouble();
    final p0x = portal.bounds[0].x * ppg;
    final p0y = portal.bounds[0].y * ppg;
    final p1x = portal.bounds[1].x * ppg;
    final p1y = portal.bounds[1].y * ppg;

    final minX = min(p0x, p1x) - _padding;
    final minY = min(p0y, p1y) - _padding;
    final maxX = max(p0x, p1x) + _padding;
    final maxY = max(p0y, p1y) + _padding;

    // Ensure minimum size for thin doors (e.g. vertical line = 0 width)
    final w = max(maxX - minX, _padding * 4);
    final h = max(maxY - minY, _padding * 4);

    position = Vector2(minX, minY);
    size = Vector2(w, h);

    if (drawn) _layoutDoor(p0x, p0y, p1x, p1y, ppg);
    _sideCells = _cellsBeside();
  }

  /// The fog cells on both sides of the doorway: for each square along the
  /// door line, the cells half a square to either side of its midpoint.
  /// Cells outside the map are left out.
  List<int> _cellsBeside() {
    final map = state.map;
    if (map == null) return const [];
    final cols = map.resolution.mapSize.dx.toInt();
    final rows = map.resolution.mapSize.dy.toInt();
    final a = portal.bounds[0], b = portal.bounds[1];
    final dx = b.x - a.x, dy = b.y - a.y;
    final len = sqrt(dx * dx + dy * dy);
    if (len == 0) return const [];
    final nx = -dy / len * 0.5, ny = dx / len * 0.5;
    final steps = max(1, len.round());
    final cells = <int>{};
    for (int i = 0; i < steps; i++) {
      final f = (i + 0.5) / steps;
      final mx = a.x + dx * f, my = a.y + dy * f;
      for (final side in const [-1, 1]) {
        final cx = (mx + side * nx).floor(), cy = (my + side * ny).floor();
        if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) cells.add(cy * cols + cx);
      }
    }
    return cells.toList();
  }

  /// Whether the players may see this door: the fog is off, or a square on
  /// either side of the doorway is revealed. Always `true` off the players'
  /// display ([forPlayers] false).
  bool get visibleToPlayers =>
      !forPlayers ||
      !state.fogEnabled ||
      _sideCells.any(state.revealedCells.contains);

  /// Lays out the drawn door: a leaf lying along +x from the hinge (local
  /// coordinates, rotated onto the wall line at render time), thinner than
  /// the wall, with a small gap at the latch end and two iron straps.
  void _layoutDoor(double p0x, double p0y, double p1x, double p1y, double ppg) {
    _hinge = Offset(p0x - position.x, p0y - position.y);
    _wallAngle = atan2(p1y - p0y, p1x - p0x);
    _swingSign = swingSign(_wallAngle);
    final length = sqrt(pow(p1x - p0x, 2) + pow(p1y - p0y, 2));
    final thickness = 0.14 * ppg;
    _leaf = Rect.fromLTWH(0, -thickness / 2, length - 0.04 * ppg, thickness);
    final strap = 0.05 * ppg;
    final overhang = 0.01 * ppg;
    _straps = [
      for (final at in const [0.2, 0.8])
        Rect.fromLTWH(_leaf.width * at - strap / 2, _leaf.top - overhang,
            strap, thickness + 2 * overhang),
    ];
    _grain = thickness / 6;
    _pinRadius = thickness * 0.32;
    _shadowOffset = Offset(0.035 * ppg, 0.035 * ppg);
    _grainPaint.strokeWidth = max(1.0, 0.008 * ppg);
    _edgePaint.strokeWidth = max(1.0, 0.014 * ppg);
    _swing = DoorSwing(open: isOpen);
  }

  /// Which way a door leaf lying at [wallAngle] (hinge → latch, radians,
  /// screen coordinates with y down) turns to open: `1` clockwise, `-1`
  /// counter-clockwise — whichever ends south or east of the wall line.
  static double swingSign(double wallAngle) {
    // The leaf's clockwise normal; open toward it if it points south/east.
    final nx = -sin(wallAngle);
    final ny = cos(wallAngle);
    return nx + ny >= 0 ? 1 : -1;
  }

  /// Whether the DM has this portal open right now.
  bool get isOpen => state.openPortals.contains(portalIndex);

  @override
  void update(double dt) {
    if (drawn) _swing.step(dt, open: isOpen);
  }

  @override
  void render(Canvas canvas) {
    if (drawn) {
      if (visibleToPlayers) _renderDoor(canvas);
      return;
    }
    if (!showMarker) return;
    final rect = size.toRect();
    canvas.drawRect(rect, isOpen ? _openPaint : _closedPaint);
    canvas.drawRect(rect, _borderPaint);
  }

  /// Draws the door leaf at its current swing angle, with a soft shadow to
  /// the south-east (the direction the map prompt bakes its shadows).
  void _renderDoor(Canvas canvas) {
    final angle = _wallAngle + _swingSign * _swing.angle;

    canvas.save();
    canvas.translate(_hinge.dx + _shadowOffset.dx, _hinge.dy + _shadowOffset.dy);
    canvas.rotate(angle);
    canvas.drawRect(_leaf, _shadowPaint);
    canvas.restore();

    canvas.save();
    canvas.translate(_hinge.dx, _hinge.dy);
    canvas.rotate(angle);
    canvas.drawRect(_leaf, _woodPaint);
    for (final y in [-_grain, _grain]) {
      canvas.drawLine(Offset(_leaf.left, y), Offset(_leaf.right, y), _grainPaint);
    }
    canvas.drawRect(_leaf, _edgePaint);
    for (final s in _straps) {
      canvas.drawRect(s, _ironPaint);
    }
    canvas.drawCircle(Offset(_pinRadius, 0), _pinRadius, _ironPaint);
    canvas.restore();
  }
}

/// The swing of a drawn door between shut and open.
///
/// [t] runs linearly 0 (shut, leaf in the wall line) → 1 (open) over
/// [duration] seconds; [angle] eases it so the leaf starts and stops softly.
/// A toggle mid-swing turns the leaf around from where it is.
///
/// See also:
/// * [PortalComponent], which steps one [DoorSwing] per drawn door.
class DoorSwing {
  /// Seconds a full swing (shut → open or back) takes.
  static const double duration = 0.4;

  /// How far an open door stands from the wall line, in radians (~85°, so
  /// the open leaf doesn't read as a wall at a right angle).
  static const double openAngle = pi * 85 / 180;

  /// Linear swing position: 0 = shut, 1 = open.
  double t;

  /// Starts at rest: fully open if [open], else shut (no swing on map load).
  DoorSwing({required bool open}) : t = open ? 1.0 : 0.0;

  /// Moves [t] toward the [open] target by [dt] seconds of swing.
  void step(double dt, {required bool open}) {
    final d = dt / duration;
    t = open ? min(1.0, t + d) : max(0.0, t - d);
  }

  /// Angle of the leaf away from the wall line, in radians (eased [t]).
  double get angle => Curves.easeInOut.transform(t) * openAngle;
}
