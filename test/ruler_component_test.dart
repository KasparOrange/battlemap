import 'dart:math';

import 'package:battlemap/game/components/ruler_component.dart';
import 'package:flutter_test/flutter_test.dart';

/// The ruler's numbers stay upright on screen: the label turn undoes the
/// ruler's rotation and the camera's (Flame shows the world turned by
/// `-angle`), so their sum on screen is always zero.
void main() {
  group('RulerComponent.labelAngle', () {
    double onScreen(int rulerDeg, double camera) =>
        rulerDeg * pi / 180 + RulerComponent.labelAngle(rulerDeg, camera) - camera;

    test('unrotated ruler, unrotated camera: no turn', () {
      expect(RulerComponent.labelAngle(0, 0), 0);
    });

    test('labels are upright for every ruler rotation and camera angle', () {
      for (final rulerDeg in [0, 90, 180, 270]) {
        for (final camera in [0.0, pi / 2, pi, -pi / 2]) {
          expect(onScreen(rulerDeg, camera), closeTo(0, 1e-9),
              reason: 'ruler $rulerDeg°, camera $camera');
        }
      }
    });

    test('a ruler turned 90° turns its labels back by 90°', () {
      expect(RulerComponent.labelAngle(90, 0), closeTo(-pi / 2, 1e-9));
    });
  });
}
