import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../model/template_disc.dart';

// The DM panel's palette (dm_control_panel.dart)
const _kAccentGold = Color(0xFFd4a76a);
const _kAccentGoldDim = Color(0xFF8a7044);
const _kBorderGold = Color(0xFF5a4a30);
const _kTextPrimary = Color(0xFFd4a76a);
const _kTextSecondary = Color(0xFF8a7044);
const _kSurface = Color(0xFF241e18);
const _kSurfaceActive = Color(0xFF3a3020);
const double _kTarget = 44;
const double _kText = 14;
const double _kIcon = 20;

/// Remembers the DM's template disc look on this device (Hive box
/// `templateDisc`), so a disc shown in the next game looks the same.
///
/// Errors are logged, never thrown; a device without a stored look (or a
/// web browser without storage) gets [TemplateDisc.classic].
class TemplateDiscStore {
  TemplateDiscStore._();

  static const String _boxName = 'templateDisc';
  static const String _lookKey = 'look';

  /// The stored look ([TemplateDisc.shapeJson]) as a hidden disc, or `null`.
  static Future<TemplateDisc?> load() async {
    try {
      final box = await Hive.openBox<String>(_boxName);
      final raw = box.get(_lookKey);
      return raw == null ? null : TemplateDisc.fromJson(jsonDecode(raw));
    } catch (e) {
      debugPrint('TemplateDiscStore.load failed: $e');
      return null;
    }
  }

  /// Stores [disc]'s look (not its place).
  static Future<void> save(TemplateDisc disc) async {
    try {
      final box = await Hive.openBox<String>(_boxName);
      await box.put(_lookKey, jsonEncode(disc.shapeJson()));
    } catch (e) {
      debugPrint('TemplateDiscStore.save failed: $e');
    }
  }
}

/// The Measure tab's template disc section: show/hide, turn, bring to the
/// TV's middle, and — unfolding in place — everything about its look:
/// which radius rings, cubes and cones (sizes in feet, colour, solid or
/// dotted, labels), where the cones start and how wide they open, compass
/// marks, the middle's circle, the edge, tint, line and label size, snap.
///
/// Every change applies at once ([onChanged]) and is remembered on this
/// device ([TemplateDiscStore]); showing the disc lays the remembered look
/// on this game's disc and asks the TV to centre it in its view.
///
/// See also:
/// - [TemplateDisc], the model.
/// - [TemplateDiscComponent], which draws it on the TV and the tablet.
class TemplateDiscPanel extends StatefulWidget {
  /// This game's disc ([VttState.templateDisc]).
  final TemplateDisc disc;

  /// Called with the changed disc; [center] = put it in the TV's middle.
  final void Function(TemplateDisc disc, {bool center}) onChanged;

  /// Creates the section for [disc].
  const TemplateDiscPanel(
      {super.key, required this.disc, required this.onChanged});

  @override
  State<TemplateDiscPanel> createState() => _TemplateDiscPanelState();
}

class _TemplateDiscPanelState extends State<TemplateDiscPanel> {
  /// The look stored on this device, once loaded.
  TemplateDisc? _remembered;

  /// Whether the look editor is unfolded.
  bool _shapeOpen = false;

  /// Selected size (feet) per family, for the − / + / remove row.
  final Map<String, double?> _selected = {};

  @override
  void initState() {
    super.initState();
    TemplateDiscStore.load().then((d) {
      if (mounted && d != null) setState(() => _remembered = d);
    });
  }

  TemplateDisc get disc => widget.disc;

  /// Applies a look or place change and remembers the look.
  void _change(TemplateDisc next, {bool center = false}) {
    widget.onChanged(next, center: center);
    if (next.shapeKey != (_remembered ?? disc).shapeKey) {
      _remembered = next;
      TemplateDiscStore.save(next);
    }
  }

  void _show(bool on) {
    if (on) {
      final look = _remembered ?? disc;
      _change(disc.withShapeOf(look).copyWith(visible: true), center: true);
    } else {
      _change(disc.copyWith(visible: false));
    }
  }

  void _turn(double deg) => _change(disc.copyWith(rotation: disc.rotation + deg));

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Toggle(
          icon: Icons.track_changes,
          label: 'Template disc on the map',
          active: disc.visible,
          onTap: () => _show(!disc.visible),
        ),
        if (disc.visible) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _Chip(
                  active: false,
                  onTap: () => _turn(-15),
                  child: const _IconText(Icons.rotate_left, '15°'),
                ),
              ),
              Expanded(
                child: Text(
                  '${disc.rotation.round()}°',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: _kTextPrimary,
                      fontSize: _kText,
                      fontWeight: FontWeight.w600),
                ),
              ),
              Expanded(
                child: _Chip(
                  active: false,
                  onTap: () => _turn(15),
                  child: const _IconText(Icons.rotate_right, '15°'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          _Chip(
            active: false,
            onTap: () => _change(disc, center: true),
            child: const _IconText(
                Icons.center_focus_strong, "To the middle of the TV"),
          ),
          const SizedBox(height: 4),
          const Text(
            'Drag its middle or edge to move it, the gold knob to turn it '
            'and aim the cones (in any tab).',
            style: TextStyle(color: _kTextSecondary, fontSize: 12),
          ),
          const SizedBox(height: 6),
          _Chip(
            active: _shapeOpen,
            onTap: () => setState(() => _shapeOpen = !_shapeOpen),
            child: _IconText(
                _shapeOpen ? Icons.expand_less : Icons.tune, 'Shape'),
          ),
          AnimatedSize(
            duration: Duration(milliseconds: _shapeOpen ? 220 : 160),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _shapeOpen ? _buildShape() : const SizedBox(width: double.infinity),
          ),
        ],
      ],
    );
  }

  /// The unfolded look editor.
  Widget _buildShape() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 10),
        _family('rings', 'Radius rings', disc.rings,
            (set) => disc.copyWith(rings: set)),
        _family('cubes', 'Cubes', disc.cubes, (set) => disc.copyWith(cubes: set)),
        _family('cones', 'Cones', disc.cones, (set) => disc.copyWith(cones: set)),
        if (disc.cones.shows) ...[
          const SizedBox(height: 6),
          _choice<DiscConeAnchor>('Cone tips', [
            (DiscConeAnchor.sharedBase, 'One base'),
            (DiscConeAnchor.center, 'From the middle'),
          ], disc.coneAnchor, (v) => _change(disc.copyWith(coneAnchor: v))),
          _choice<double>('Cone width', [
            (TemplateDisc.dndConeDegrees, '5e (53°)'),
            (60, '60°'),
            (90, '90°'),
          ], disc.coneDegrees, (v) => _change(disc.copyWith(coneDegrees: v))),
        ],
        const SizedBox(height: 12),
        const _Label('Disc'),
        const SizedBox(height: 4),
        _Toggle(
          icon: Icons.adjust,
          label: 'Circle in the middle',
          active: disc.centerMark,
          onTap: () => _change(disc.copyWith(centerMark: !disc.centerMark)),
        ),
        const SizedBox(height: 6),
        _Toggle(
          icon: Icons.circle_outlined,
          label: 'Edge',
          active: disc.rim,
          onTap: () => _change(disc.copyWith(rim: !disc.rim)),
        ),
        _choice<int>('Compass marks', [(0, 'None'), (4, '4'), (8, '8'), (12, '12')],
            disc.markers, (v) => _change(disc.copyWith(markers: v))),
        _choice<double>('Tint', [
          (0, 'Clear'), (0.1, 'Light'), (0.25, 'Half'), (0.4, 'Strong'),
        ], disc.tint, (v) => _change(disc.copyWith(tint: v))),
        _choice<double>('Lines', [(0.035, 'Thin'), (0.05, 'Normal'), (0.08, 'Bold')],
            disc.lineWidth, (v) => _change(disc.copyWith(lineWidth: v))),
        _choice<double>('Labels', [(0.15, 'Small'), (0.2, 'Normal'), (0.28, 'Large')],
            disc.labelSize, (v) => _change(disc.copyWith(labelSize: v))),
        _choice<DiscSnap>('Middle snaps to', [
          (DiscSnap.none, 'Free'),
          (DiscSnap.squareCenters, 'Squares'),
          (DiscSnap.squareCorners, 'Corners'),
        ], disc.snap, (v) {
          final next = disc.copyWith(snap: v);
          final p = next.snapped(Offset(disc.x, disc.y));
          _change(next.copyWith(x: p.dx, y: p.dy));
        }),
        const SizedBox(height: 10),
        _Chip(
          active: false,
          onTap: () => _change(disc.withShapeOf(TemplateDisc.classic())),
          child: const _IconText(Icons.restart_alt, 'Back to the classic disc'),
        ),
        const SizedBox(height: 4),
      ],
    );
  }

  /// One family's editor: shown or not, its sizes (tap one for − / + /
  /// remove, + adds the next five feet up), colour, line and labels.
  Widget _family(String key, String title, DiscShapeSet set,
      TemplateDisc Function(DiscShapeSet) apply) {
    final selected = set.sizes.contains(_selected[key]) ? _selected[key] : null;
    void edit(DiscShapeSet next, {double? select}) {
      setState(() => _selected[key] = select);
      _change(apply(next));
    }

    String ft(double v) =>
        v == v.roundToDouble() ? '${v.toInt()}' : v.toStringAsFixed(1);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Toggle(
            icon: switch (key) {
              'rings' => Icons.radio_button_unchecked,
              'cubes' => Icons.crop_square,
              _ => Icons.change_history,
            },
            label: title,
            active: set.visible,
            onTap: () => edit(set.copyWith(visible: !set.visible)),
          ),
          if (set.visible) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final v in set.sizes)
                  SizedBox(
                    width: 56,
                    child: _Chip(
                      active: v == selected,
                      onTap: () => setState(
                          () => _selected[key] = v == selected ? null : v),
                      child: _text("${ft(v)}'", v == selected),
                    ),
                  ),
                SizedBox(
                  width: 56,
                  child: _Chip(
                    active: false,
                    onTap: () {
                      var next = set.largest + TemplateDisc.feetPerSquare;
                      if (next > 120) next = 120;
                      if (set.sizes.contains(next)) return;
                      edit(set.copyWith(sizes: [...set.sizes, next]), select: next);
                    },
                    child: const Icon(Icons.add, color: _kAccentGold, size: _kIcon),
                  ),
                ),
              ],
            ),
            if (selected != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  for (final step in [-5.0, 5.0])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: SizedBox(
                        width: 56,
                        child: _Chip(
                          active: false,
                          onTap: () {
                            final v = (selected + step).clamp(5.0, 120.0);
                            if (set.sizes.contains(v)) return;
                            edit(
                                set.copyWith(sizes: [
                                  for (final s in set.sizes) s == selected ? v : s
                                ]),
                                select: v);
                          },
                          child: Icon(step < 0 ? Icons.remove : Icons.add,
                              color: _kAccentGold, size: _kIcon),
                        ),
                      ),
                    ),
                  Expanded(child: _text('${ft(selected)} ft', true)),
                  SizedBox(
                    width: 56,
                    child: _Chip(
                      active: false,
                      onTap: () => edit(set.copyWith(
                          sizes: set.sizes.where((s) => s != selected).toList())),
                      child: const Icon(Icons.delete_outline,
                          color: _kAccentGold, size: _kIcon),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 6),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: [
                for (final c in TemplateDisc.palette)
                  _Swatch(
                    color: Color(c),
                    active: c == set.color,
                    onTap: () => edit(set.copyWith(color: c), select: selected),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                for (final (style, label) in [
                  (DiscLineStyle.solid, 'Solid'),
                  (DiscLineStyle.dotted, 'Dotted'),
                ]) ...[
                  Expanded(
                    child: _Chip(
                      active: set.line == style,
                      onTap: () => edit(set.copyWith(line: style), select: selected),
                      child: _text(label, set.line == style),
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Expanded(
                  child: _Chip(
                    active: set.labels,
                    onTap: () =>
                        edit(set.copyWith(labels: !set.labels), select: selected),
                    child: _text('Labels', set.labels),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// A labelled row of mutually exclusive chips; the chip whose value is
  /// closest to [current] is the active one.
  Widget _choice<T>(String title, List<(T, String)> options, T current,
      ValueChanged<T> onPick) {
    bool same(T a, T b) =>
        a is double && b is double ? (a - b).abs() < 1e-6 : a == b;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Label(title),
          const SizedBox(height: 4),
          Row(
            children: [
              for (var i = 0; i < options.length; i++) ...[
                if (i > 0) const SizedBox(width: 6),
                Expanded(
                  child: _Chip(
                    active: same(options[i].$1, current),
                    onTap: () => onPick(options[i].$1),
                    child: _text(options[i].$2, same(options[i].$1, current)),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  static Widget _text(String s, bool active) => Text(
        s,
        textAlign: TextAlign.center,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: active ? _kTextPrimary : _kTextSecondary,
          fontSize: _kText,
          fontWeight: FontWeight.w600,
        ),
      );
}

/// Icon + text, centred (chip content).
class _IconText extends StatelessWidget {
  final IconData icon;
  final String text;
  const _IconText(this.icon, this.text);

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: _kAccentGold, size: _kIcon),
          const SizedBox(width: 6),
          Flexible(
            child: Text(text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: _kTextPrimary,
                    fontSize: _kText,
                    fontWeight: FontWeight.w600)),
          ),
        ],
      );
}

/// Small gold section label.
class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(
          color: _kAccentGoldDim,
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5));
}

/// Selectable chip (≥ 44 px), the DM panel's look.
class _Chip extends StatelessWidget {
  final bool active;
  final VoidCallback onTap;
  final Widget child;
  const _Chip({required this.active, required this.onTap, required this.child});

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: _kTarget),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          decoration: BoxDecoration(
            color: active ? _kSurfaceActive : _kSurface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: active ? _kAccentGold : _kBorderGold),
          ),
          child: Center(child: child),
        ),
      );
}

/// On/off row with a dot (the DM panel's toggle look).
class _Toggle extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Toggle(
      {required this.icon,
      required this.label,
      required this.active,
      required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: _kTarget),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: active ? _kSurfaceActive : _kSurface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: active ? _kAccentGold : _kBorderGold),
          ),
          child: Row(
            children: [
              Icon(icon,
                  color: active ? _kAccentGold : _kAccentGoldDim, size: _kIcon),
              const SizedBox(width: 8),
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: active ? _kTextPrimary : _kTextSecondary,
                        fontSize: _kText)),
              ),
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: active ? _kAccentGold : _kBorderGold,
                ),
              ),
            ],
          ),
        ),
      );
}

/// A colour swatch (36 px circle, 44 px target), ringed when chosen.
class _Swatch extends StatelessWidget {
  final Color color;
  final bool active;
  final VoidCallback onTap;
  const _Swatch({required this.color, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: 34,
          height: _kTarget,
          child: Center(
            child: Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(
                  color: active ? _kAccentGold : _kBorderGold,
                  width: active ? 3 : 1,
                ),
              ),
            ),
          ),
        ),
      );
}
