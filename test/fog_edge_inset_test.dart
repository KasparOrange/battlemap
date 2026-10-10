import 'dart:ui';

import 'package:battlemap/game/components/fog_of_war_component.dart';
import 'package:battlemap/model/session.dart';
import 'package:flutter_test/flutter_test.dart';

/// "Trim revealed edges": the revealed area shrinks evenly at its rim.
void main() {
  const ppg = 100.0;

  /// Whether the point ([x], [y]) is inside the union of [rects].
  bool inside(List<Rect> rects, double x, double y) =>
      rects.any((r) => r.contains(Offset(x, y)));

  /// Cell indices of the given (col, row) pairs on a grid [cols] wide.
  Set<int> cellsOf(int cols, List<(int, int)> xy) =>
      {for (final (x, y) in xy) y * cols + x};

  test('no trim gives one square per revealed cell', () {
    final rects = fogRevealRects({0, 5}, 4, 4, ppg, 0);
    expect(rects, [
      const Rect.fromLTWH(0, 0, ppg, ppg),
      const Rect.fromLTWH(100, 100, ppg, ppg),
    ]);
  });

  test('a block is pulled in on every side that borders fog', () {
    // 3 × 3 block at (1..3, 1..3) on a 5 × 5 grid, 20 % trim.
    final cells = cellsOf(5, [
      for (var y = 1; y <= 3; y++)
        for (var x = 1; x <= 3; x++) (x, y)
    ]);
    final rects = fogRevealRects(cells, 5, 5, ppg, 20);
    // The rim is fogged, just inside it is revealed.
    expect(inside(rects, 110, 250), isFalse);
    expect(inside(rects, 125, 250), isTrue);
    expect(inside(rects, 250, 390), isFalse);
    expect(inside(rects, 250, 375), isTrue);
    // Inner seams between squares stay open.
    expect(inside(rects, 200, 200), isTrue);
    expect(inside(rects, 300, 250), isTrue);
  });

  test('the inner corner of an L gets a notch', () {
    // L: (0,0) (1,0) (0,1) on a 3 × 3 grid; (1,1) is fogged.
    final cells = cellsOf(3, [(0, 0), (1, 0), (0, 1)]);
    final rects = fogRevealRects(cells, 3, 3, ppg, 20);
    // Near the corner of the fogged (1,1): within the trim → fogged.
    expect(inside(rects, 90, 90), isFalse);
    // Further away along both arms → revealed.
    expect(inside(rects, 70, 70), isTrue);
    expect(inside(rects, 90, 50), isTrue);
    expect(inside(rects, 50, 90), isTrue);
  });

  test('the map border is never trimmed', () {
    final rects = fogRevealRects({0}, 2, 2, ppg, 20);
    expect(inside(rects, 1, 1), isTrue);
    expect(inside(rects, 90, 50), isFalse);
    expect(inside(rects, 50, 90), isFalse);
  });

  test('the trim stops at 45 % of a square', () {
    final rects = fogRevealRects(cellsOf(3, [(1, 1)]), 3, 3, ppg, 90);
    expect(rects.single, const Rect.fromLTRB(145, 145, 155, 155));
  });

  test('the setting round-trips and defaults to 0', () {
    expect(SessionSettings().fogEdgeInset, 0);
    expect(SessionSettings.fromJson({}).fogEdgeInset, 0);
    final s = SessionSettings(fogEdgeInset: 15);
    expect(SessionSettings.fromJson(s.toJson()).fogEdgeInset, 15);
    expect(s.copy().fogEdgeInset, 15);
    expect(SessionSettings.fromJson({'fogEdgeInset': 80}).fogEdgeInset, 45);
  });
}
