import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../model/map_token.dart';

/// Draws a single token on the battlemap.
///
/// Renders a colored circle with the token's label number, plus optional
/// extras: a name label above, an HP bar below, and condition indicator
/// dots above the name. All of these are driven by the token's data fields.
///
/// Text painters for the label and name are cached and only recreated when
/// the underlying data changes, to avoid per-frame allocation.
///
/// See also:
/// - [TokenLayer], which manages a collection of these components.
/// - [MapToken], the data model backing each token.
class TokenComponent extends PositionComponent {
  /// Unique identifier matching [MapToken.id].
  String tokenId;

  /// Short display label (e.g. "1", "2") shown inside the circle.
  String label;

  /// Fill color of the token circle.
  Color color;

  /// Horizontal grid coordinate (column index, zero-based).
  int gridX;

  /// Vertical grid coordinate (row index, zero-based).
  int gridY;

  /// Size of one grid cell in world pixels.
  final double cellSize;

  /// Display name shown above the token circle.
  ///
  /// Empty string means no name label is rendered.
  String name;

  /// Maximum hit points for this token.
  ///
  /// When greater than zero, an HP bar is rendered below the circle.
  int maxHp;

  /// Current hit points for this token.
  ///
  /// Clamped to `[0, maxHp]` for rendering the HP bar fill.
  int currentHp;

  /// Active conditions on this token (e.g. "Poisoned", "Stunned").
  ///
  /// Each condition is rendered as a small colored dot above the name,
  /// using colors from [MapToken.conditionColors].
  List<String> conditions;

  // Cached text painters to avoid per-frame allocation
  TextPainter? _labelPainter;
  String? _cachedLabel;
  TextPainter? _namePainter;
  String? _cachedName;

  /// Creates a [TokenComponent] positioned at the given grid cell.
  ///
  /// The component's world position is computed from [gridX], [gridY],
  /// and [cellSize]. The [size] is set to one full grid cell so that
  /// hit-testing covers the entire cell area.
  TokenComponent({
    required this.tokenId,
    required this.label,
    required this.color,
    required this.gridX,
    required this.gridY,
    required this.cellSize,
    this.name = '',
    this.maxHp = 0,
    this.currentHp = 0,
    this.conditions = const [],
  }) : super(
          position: Vector2(
            gridX * cellSize,
            gridY * cellSize,
          ),
          size: Vector2(cellSize, cellSize),
        );

  /// Updates this component's visual state from a [MapToken].
  ///
  /// Only repositions the component if the grid coordinates changed.
  /// All rendering fields (label, color, name, HP, conditions) are
  /// updated unconditionally.
  void updateFrom(MapToken token) {
    label = token.label;
    color = token.color;
    name = token.name;
    maxHp = token.maxHp;
    currentHp = token.currentHp;
    conditions = List.of(token.conditions);
    if (gridX != token.gridX || gridY != token.gridY) {
      gridX = token.gridX;
      gridY = token.gridY;
      position = Vector2(
        gridX * cellSize,
        gridY * cellSize,
      );
    }
  }

  /// Returns a cached [TextPainter] for the center label.
  ///
  /// Only recreates the painter when [label] changes.
  TextPainter _getLabelPainter() {
    if (_labelPainter == null || _cachedLabel != label) {
      _cachedLabel = label;
      _labelPainter = TextPainter(
        text: TextSpan(
          text: label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
    }
    return _labelPainter!;
  }

  /// Returns a cached [TextPainter] for the name label.
  ///
  /// Only recreates the painter when [name] changes.
  TextPainter _getNamePainter() {
    if (_namePainter == null || _cachedName != name) {
      _cachedName = name;
      _namePainter = TextPainter(
        text: TextSpan(
          text: name,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.w500,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
    }
    return _namePainter!;
  }

  @override
  void render(Canvas canvas) {
    final center = Offset(cellSize / 2, cellSize / 2);
    final radius = cellSize * 0.4;

    // --- Condition dots above everything ---
    if (conditions.isNotEmpty) {
      _renderConditionDots(canvas, center, radius);
    }

    // --- Name label above the circle ---
    if (name.isNotEmpty) {
      _renderNameLabel(canvas, center, radius);
    }

    // --- Shadow ---
    canvas.drawCircle(
      center + const Offset(1, 2),
      radius,
      Paint()..color = Colors.black38,
    );

    // --- Token circle ---
    canvas.drawCircle(
      center,
      radius,
      Paint()..color = color,
    );

    // --- Border ---
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = Colors.white24
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    // --- Center label ---
    final lp = _getLabelPainter();
    lp.paint(
      canvas,
      center - Offset(lp.width / 2, lp.height / 2),
    );

    // --- HP bar below the circle ---
    if (maxHp > 0) {
      _renderHpBar(canvas, center, radius);
    }
  }

  /// Renders a thin HP bar below the token circle.
  ///
  /// The bar background is dark grey, and the fill color interpolates
  /// from red (0 HP) through yellow (50%) to green (full HP).
  void _renderHpBar(Canvas canvas, Offset center, double radius) {
    const barHeight = 3.0;
    final barWidth = radius * 2;
    final barLeft = center.dx - radius;
    final barTop = center.dy + radius + 2;

    // Background
    final bgRect = Rect.fromLTWH(barLeft, barTop, barWidth, barHeight);
    canvas.drawRRect(
      RRect.fromRectAndRadius(bgRect, const Radius.circular(1.5)),
      Paint()..color = const Color(0x44FFFFFF),
    );

    // Fill
    final ratio = (currentHp / maxHp).clamp(0.0, 1.0);
    if (ratio > 0) {
      final fillColor = _hpColor(ratio);
      final fillRect =
          Rect.fromLTWH(barLeft, barTop, barWidth * ratio, barHeight);
      canvas.drawRRect(
        RRect.fromRectAndRadius(fillRect, const Radius.circular(1.5)),
        Paint()..color = fillColor,
      );
    }
  }

  /// Computes the HP bar fill color for a given [ratio] (0.0 to 1.0).
  ///
  /// Interpolates red → yellow → green:
  /// - 0.0 → red (0xFFE53935)
  /// - 0.5 → yellow (0xFFFDD835)
  /// - 1.0 → green (0xFF43A047)
  Color _hpColor(double ratio) {
    const red = Color(0xFFE53935);
    const yellow = Color(0xFFFDD835);
    const green = Color(0xFF43A047);

    if (ratio <= 0.5) {
      return Color.lerp(red, yellow, ratio * 2)!;
    } else {
      return Color.lerp(yellow, green, (ratio - 0.5) * 2)!;
    }
  }

  /// Renders the token name as white text on a semi-transparent black pill.
  ///
  /// Positioned centered horizontally, directly above the token circle.
  void _renderNameLabel(Canvas canvas, Offset center, double radius) {
    final np = _getNamePainter();
    const hPad = 4.0;
    const vPad = 1.5;
    final pillW = np.width + hPad * 2;
    final pillH = np.height + vPad * 2;
    final pillLeft = center.dx - pillW / 2;
    // Position above the circle (with a small gap)
    final pillTop = center.dy - radius - pillH - 2;

    // Pill background
    final pillRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(pillLeft, pillTop, pillW, pillH),
      const Radius.circular(4),
    );
    canvas.drawRRect(
      pillRect,
      Paint()..color = const Color(0xAA000000),
    );

    // Text
    np.paint(canvas, Offset(pillLeft + hPad, pillTop + vPad));
  }

  /// Renders small colored dots for each active condition.
  ///
  /// Dots are arranged in a horizontal row centered above the name label
  /// (or above the token circle if no name). Each condition maps to a
  /// color via [MapToken.conditionColors]. A maximum of 5 dots fit per
  /// row before wrapping; for simplicity, only the first row is shown.
  void _renderConditionDots(Canvas canvas, Offset center, double radius) {
    const dotRadius = 2.5;
    const dotSpacing = 7.0; // diameter + gap
    final count = conditions.length;
    final totalWidth = count * dotSpacing - (dotSpacing - dotRadius * 2);

    // Position above the name label area
    double topY;
    if (name.isNotEmpty) {
      final np = _getNamePainter();
      const vPad = 1.5;
      final pillH = np.height + vPad * 2;
      topY = center.dy - radius - pillH - 2 - dotRadius * 2 - 3;
    } else {
      topY = center.dy - radius - dotRadius * 2 - 4;
    }

    final startX = center.dx - totalWidth / 2 + dotRadius;

    for (int i = 0; i < count; i++) {
      final conditionName = conditions[i];
      final dotColorValue =
          MapToken.conditionColors[conditionName] ?? 0xFFBDBDBD;
      final dotColor = Color(dotColorValue);
      canvas.drawCircle(
        Offset(startX + i * dotSpacing, topY),
        dotRadius,
        Paint()..color = dotColor,
      );
    }
  }
}
