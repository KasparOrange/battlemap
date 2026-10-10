import 'package:battlemap/state/vtt_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// The circle reveal in the preview ("Preview first"): the last circle
/// stays live, so the radius − / + redraws it until it is applied.
void main() {
  late VttState state;

  setUp(() {
    state = VttState()..shadowMode = true;
  });

  test('a circle in the preview is live and keeps what was staged before',
      () {
    state.applyBrushReveal([1]); // staged earlier
    state.previewCircle({10, 11, 12}, center: 11);
    expect(state.liveCircleCell, 11);
    expect(state.shadowRevealCells, {1, 10, 11, 12});
    expect(state.revealedCells, isEmpty); // players see nothing yet
  });

  test('replaceLast swaps the circle, smaller or bigger', () {
    state.applyBrushReveal([1]);
    state.previewCircle({10, 11, 12}, center: 11);
    state.previewCircle({11}, replaceLast: true);
    expect(state.shadowRevealCells, {1, 11});
    state.previewCircle({9, 10, 11, 12, 13}, replaceLast: true);
    expect(state.shadowRevealCells, {1, 9, 10, 11, 12, 13});
  });

  test('a cell staged before and inside the circle survives a shrink', () {
    state.applyBrushReveal([10]);
    state.previewCircle({10, 11, 12}, center: 11);
    state.previewCircle({11}, replaceLast: true);
    expect(state.shadowRevealCells, {10, 11});
  });

  test('hide mode stages into the hide half', () {
    state.revealedCells = {10, 11, 12};
    state.revealMode = false;
    state.previewCircle({10, 11, 12}, center: 11);
    state.previewCircle({11}, replaceLast: true);
    expect(state.shadowHideCells, {11});
    expect(state.shadowRevealCells, isEmpty);
  });

  test('apply, discard or another fog change ends the live circle', () {
    for (final end in <void Function()>[
      state.commitShadow,
      state.clearShadow,
      () => state.applyBrushReveal([40]),
      () => state.revealRoom({40}),
      () => state.toggleReveal(40),
    ]) {
      state.shadowMode = true;
      state.previewCircle({10, 11}, center: 10);
      end();
      expect(state.liveCircleCell, isNull);
      final before = Set.of(state.shadowRevealCells);
      state.previewCircle({20, 21, 22}, replaceLast: true);
      expect(state.shadowRevealCells, before, reason: 'no live circle');
    }
  });

  test('a new circle becomes the live one, the old stays staged', () {
    state.previewCircle({1, 2}, center: 1);
    state.previewCircle({20, 21}, center: 20);
    state.previewCircle({20}, replaceLast: true);
    expect(state.liveCircleCell, 20);
    expect(state.shadowRevealCells, {1, 2, 20});
  });

  test('without the preview a circle reveals at once and is not live', () {
    state.shadowMode = false;
    state.previewCircle({10, 11}, center: 10);
    expect(state.revealedCells, {10, 11});
    expect(state.liveCircleCell, isNull);
    state.previewCircle({10}, replaceLast: true);
    expect(state.revealedCells, {10, 11});
  });

  test('radius change calls the game before it notifies', () {
    var calls = 0;
    state.onRevealRadiusChanged = () => calls++;
    state.setRevealRadius(5);
    state.setRevealRadius(5); // same radius: nothing
    state.setRevealRadius(99); // clamped to 30
    expect(calls, 2);
    expect(state.revealRadius, 30);
  });

  test('the TV emptying the preview ends the tablet\'s live circle', () {
    state.previewCircle({10, 11}, center: 10);
    final json = state.toJson();
    // Within the grace period an empty broadcast (sent before the TV got
    // the circle) leaves it alone
    final empty = Map<String, dynamic>.of(json)
      ..['shadowRevealCells'] = <int>[]
      ..['shadowHideCells'] = <int>[];
    state.applyRemoteState(empty);
    expect(state.liveCircleCell, 10);
    // A broadcast that still shows the preview keeps it too
    state.applyRemoteState(json);
    expect(state.liveCircleCell, 10);
  });
}
