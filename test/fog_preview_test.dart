import 'dart:ui';

import 'package:battlemap/game/components/fog_of_war_component.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:flame/components.dart';
import 'package:flutter_test/flutter_test.dart';

/// The "Preview first" tint (blue = staged reveal) is the DM's alone: the
/// TV's fog never shows it.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Renders a 2 × 1 fog with square 0 staged for reveal and returns the
  /// colour in the middle of square 0.
  Future<Color> stagedSquare({required bool showPreview}) async {
    final state = VttState()
      ..shadowMode = true
      ..shadowRevealCells = {0};
    final fog = FogOfWarComponent(
      state: state,
      pixelsPerGrid: 20,
      gridCols: 2,
      gridRows: 1,
      mapSize: Vector2(40, 20),
      forPlayers: true,
      showPreview: showPreview,
    );
    final recorder = PictureRecorder();
    fog.render(Canvas(recorder));
    final image = await recorder.endRecording().toImage(40, 20);
    final bytes = (await image.toByteData())!;
    final o = (10 * 40 + 10) * 4;
    return Color.fromARGB(bytes.getUint8(o + 3), bytes.getUint8(o),
        bytes.getUint8(o + 1), bytes.getUint8(o + 2));
  }

  test('the TV draws staged squares as plain fog', () async {
    final c = await stagedSquare(showPreview: false);
    expect((c.r * 255).round(), 0);
    expect((c.b * 255).round(), 0);
  });

  test('the tablet tints staged squares blue', () async {
    final c = await stagedSquare(showPreview: true);
    expect((c.b * 255).round(), greaterThan(20));
  });
}
