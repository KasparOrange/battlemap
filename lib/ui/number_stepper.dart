import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// The DM panel's warm palette (dm_control_panel.dart / grid_editor.dart).
const _bg = Color(0xFF1a1512);
const _gold = Color(0xFFd4a76a);
const _goldDim = Color(0xFF8a7044);
const _border = Color(0xFF5a4a30);

/// A number with step buttons on both sides — the smallest step next to
/// the number, bigger ones further out (`−10 −5 −2 −1 [ 12 ] +1 +2 +5 +10`)
/// — and a tap on the number opens a numpad to type it ([showNumpad]).
///
/// [steps] are the step sizes, smallest first; where the row is too narrow
/// for all of them the biggest are left off (never fewer than one per
/// side). Results are clamped to [min]..[max]; with [decimals] 0 they are
/// whole numbers, otherwise [decimals] is only what is shown. Every button is a focusable [TextButton] / [InkWell], so the TV
/// remote reaches it too.
///
/// See also:
/// - [showNumpad], the direct-edit dialog behind the number.
/// - [showMapGridDialog] and the grid editor, which count squares with it.
class NumberStepper extends StatelessWidget {
  /// The number shown.
  final double value;

  /// Called with the new value (already clamped and rounded).
  final ValueChanged<double> onChanged;

  /// Step sizes, smallest first.
  final List<double> steps;

  /// Smallest allowed value.
  final double min;

  /// Largest allowed value.
  final double max;

  /// Decimal places shown and typed (0 = whole numbers only).
  final int decimals;

  /// Unit after the number ("px", "cm", "squares"), or `null`.
  final String? unit;

  /// What the number is — the numpad's title and the buttons' tooltips.
  final String label;

  /// Key of the number's text, for widget tests.
  final Key? valueKey;

  /// Creates a stepper; see the class doc.
  const NumberStepper({
    super.key,
    required this.value,
    required this.onChanged,
    required this.label,
    this.steps = const [1, 2, 5, 10],
    this.min = 0,
    this.max = 9999,
    this.decimals = 0,
    this.unit,
    this.valueKey,
  });

  void _set(double v) {
    // Whole numbers stay whole; fractions keep their finer digits (a grid
    // fitted to 0.003 px is not snapped to the 0.01 the stepper shows).
    final f = math.pow(10, decimals == 0 ? 0 : 6);
    final r = (v.clamp(min, max) * f).round() / f;
    if (r != value) onChanged(r);
  }

  Future<void> _type(BuildContext context) async {
    final v = await showNumpad(
      context,
      title: label,
      value: value,
      decimals: decimals,
      min: min,
      max: max,
      unit: unit,
    );
    if (v != null) _set(v);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        const valueW = 76.0, gap = 4.0;
        final room = c.maxWidth.isFinite ? c.maxWidth : 600.0;
        final pairs = ((room - valueW) / (2 * (36 + gap))).floor().clamp(1, steps.length);
        final shown = steps.take(pairs).toList();
        final btnW = ((room - valueW) / (2 * pairs) - gap).clamp(36.0, 54.0);
        Widget btn(double d) {
          final enabled = d < 0 ? value > min : value < max;
          final text = '${d < 0 ? '−' : '+'}${formatStep(d.abs())}';
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: gap / 2),
            child: Tooltip(
              message: '$label $text',
              child: SizedBox(
                width: btnW,
                height: 44,
                child: TextButton(
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    foregroundColor: _gold,
                    disabledForegroundColor: _border,
                    backgroundColor: _bg,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: const BorderSide(color: _border),
                    ),
                  ),
                  onPressed: enabled ? () => _set(value + d) : null,
                  child: Text(text, maxLines: 1, style: const TextStyle(fontSize: 12.5)),
                ),
              ),
            ),
          );
        }

        return Row(
          children: [
            for (final s in shown.reversed) btn(-s),
            Expanded(
              child: Tooltip(
                message: 'Type $label',
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () => _type(context),
                  child: Container(
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: _goldDim),
                    ),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: value.toStringAsFixed(decimals),
                                style: const TextStyle(
                                  color: _gold,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              if (unit != null)
                                TextSpan(
                                  text: ' $unit',
                                  style: const TextStyle(color: _goldDim, fontSize: 12),
                                ),
                            ],
                          ),
                          key: valueKey,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            for (final s in shown) btn(s),
          ],
        );
      },
    );
  }

  /// A step size as a button shows it: `1`, `10`, `.5`, `.01`.
  static String formatStep(double s) {
    if (s == s.roundToDouble()) return s.toInt().toString();
    var t = s.toString();
    if (t.startsWith('0.')) t = t.substring(1);
    return t;
  }
}

/// Opens a numpad dialog to type a number directly and returns it, or
/// `null` when cancelled.
///
/// Starts showing [value] (rounded to [decimals]); the first key replaces
/// it, like a calculator. A decimal key only when [decimals] > 0. OK stays
/// off while the number is outside [min]..[max] (the range is shown). A
/// hardware keyboard works too: digits, `.`/`,`, Backspace, Enter, Escape.
///
/// See also:
/// - [NumberStepper], whose number opens it.
Future<double?> showNumpad(
  BuildContext context, {
  required String title,
  required double value,
  int decimals = 0,
  double min = 0,
  double max = 9999,
  String? unit,
}) {
  return showDialog<double>(
    context: context,
    builder:
        (_) => _NumpadDialog(
          title: title,
          value: value,
          decimals: decimals,
          min: min,
          max: max,
          unit: unit,
        ),
  );
}

class _NumpadDialog extends StatefulWidget {
  final String title;
  final double value;
  final int decimals;
  final double min;
  final double max;
  final String? unit;

  const _NumpadDialog({
    required this.title,
    required this.value,
    required this.decimals,
    required this.min,
    required this.max,
    required this.unit,
  });

  @override
  State<_NumpadDialog> createState() => _NumpadDialogState();
}

class _NumpadDialogState extends State<_NumpadDialog> {
  late String _text = widget.value.toStringAsFixed(widget.decimals);

  /// Whether the next key replaces the shown number (until the first key).
  bool _fresh = true;

  double? get _number => double.tryParse(_text);

  bool get _valid {
    final n = _number;
    return n != null && n >= widget.min && n <= widget.max;
  }

  void _key(String k) {
    setState(() {
      if (_fresh) {
        _text = '';
        _fresh = false;
      }
      if (k == '⌫') {
        if (_text.isNotEmpty) _text = _text.substring(0, _text.length - 1);
        return;
      }
      if (k == '.') {
        if (widget.decimals == 0 || _text.contains('.')) return;
        _text = _text.isEmpty ? '0.' : '$_text.';
        return;
      }
      final dot = _text.indexOf('.');
      if (dot >= 0 && _text.length - dot > widget.decimals) return;
      _text = _text == '0' ? k : '$_text$k';
    });
  }

  void _ok() {
    if (_valid) Navigator.pop(context, _number);
  }

  KeyEventResult _onKey(FocusNode _, KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
    final ch = e.character;
    if (ch != null && RegExp(r'^[0-9]$').hasMatch(ch)) {
      _key(ch);
    } else if (ch == '.' || ch == ',') {
      _key('.');
    } else if (e.logicalKey == LogicalKeyboardKey.backspace) {
      _key('⌫');
    } else if (e.logicalKey == LogicalKeyboardKey.enter ||
        e.logicalKey == LogicalKeyboardKey.numpadEnter) {
      _ok();
    } else {
      return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    String fmt(double v) => v.toStringAsFixed(widget.decimals);
    final keys = [
      '7',
      '8',
      '9',
      '4',
      '5',
      '6',
      '1',
      '2',
      '3',
      widget.decimals > 0 ? '.' : '',
      '0',
      '⌫',
    ];
    return AlertDialog(
      backgroundColor: _bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: _border),
      ),
      title: Text(widget.title, style: const TextStyle(color: _gold, fontSize: 16)),
      content: Focus(
        autofocus: true,
        onKeyEvent: _onKey,
        child: SizedBox(
          width: 260,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _valid ? _gold : Colors.orangeAccent),
                ),
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: _text.isEmpty ? ' ' : _text,
                        style: TextStyle(
                          color: _fresh ? _goldDim : _gold,
                          fontSize: 28,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (widget.unit != null)
                        TextSpan(
                          text: ' ${widget.unit}',
                          style: const TextStyle(color: _goldDim, fontSize: 14),
                        ),
                    ],
                  ),
                  key: const ValueKey('numpadDisplay'),
                  textAlign: TextAlign.right,
                ),
              ),
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '${fmt(widget.min)} – ${fmt(widget.max)}',
                  style: TextStyle(color: _valid ? _goldDim : Colors.orangeAccent, fontSize: 12),
                ),
              ),
              const SizedBox(height: 8),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
                childAspectRatio: 1.6,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (final k in keys)
                    k.isEmpty
                        ? const SizedBox()
                        : TextButton(
                          key: ValueKey('numpad$k'),
                          style: TextButton.styleFrom(
                            foregroundColor: _gold,
                            backgroundColor: const Color(0xFF221c17),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                              side: const BorderSide(color: _border),
                            ),
                          ),
                          onPressed: () => _key(k),
                          child: Text(k, style: const TextStyle(fontSize: 22)),
                        ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel', style: TextStyle(color: _goldDim)),
        ),
        FilledButton(
          key: const ValueKey('numpadOk'),
          style: FilledButton.styleFrom(
            backgroundColor: _gold,
            foregroundColor: _bg,
            disabledBackgroundColor: _border,
          ),
          onPressed: _valid ? _ok : null,
          child: const Text('OK'),
        ),
      ],
    );
  }
}
