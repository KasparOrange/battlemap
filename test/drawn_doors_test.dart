import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:battlemap/game/components/portal_component.dart';
import 'package:battlemap/model/uvtt_parser.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// Minimal 1x1 PNG in base64 (dummy map image).
const _tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

/// A 4×4 UVTT map with one closed door on the edge (1,2)–(2,2); [battlemap]
/// becomes the file's `"battlemap"` extension object when given.
String _uvtt({Map<String, dynamic>? battlemap}) => jsonEncode({
      'format': 0.3,
      'resolution': {
        'map_origin': {'x': 0, 'y': 0},
        'map_size': {'x': 4, 'y': 4},
        'pixels_per_grid': 100,
      },
      'line_of_sight': <List>[],
      'portals': [
        {
          'position': {'x': 1.5, 'y': 2},
          'bounds': [
            {'x': 1, 'y': 2},
            {'x': 2, 'y': 2},
          ],
          'rotation': 0.0,
          'closed': true,
          'freestanding': false,
        },
      ],
      'image': _tinyPngBase64,
      if (battlemap != null) 'battlemap': battlemap,
    });

void main() {
  group('UvttMap.drawDoors', () {
    test('defaults to false without the battlemap extension', () {
      expect(UvttParser.parse(_uvtt()).drawDoors, isFalse);
    });

    test('reads battlemap.draw_doors', () {
      expect(
          UvttParser.parse(_uvtt(battlemap: {'draw_doors': true})).drawDoors,
          isTrue);
      expect(
          UvttParser.parse(_uvtt(battlemap: {'draw_doors': false})).drawDoors,
          isFalse);
    });

    test('ignores an extension without draw_doors', () {
      expect(UvttParser.parse(_uvtt(battlemap: {})).drawDoors, isFalse);
    });
  });

  group('PortalComponent look', () {
    PortalComponent portalFor(String uvtt) {
      final state = VttState()..loadMap(Uint8List.fromList(utf8.encode(uvtt)));
      return PortalComponent(
        portalIndex: 0,
        portal: state.map!.portals[0],
        state: state,
        pixelsPerGrid: state.map!.resolution.pixelsPerGrid,
      );
    }

    test('Dungeondraft-style map keeps the marker', () {
      expect(portalFor(_uvtt()).drawn, isFalse);
    });

    test('map with drawn doors draws the door', () {
      expect(portalFor(_uvtt(battlemap: {'draw_doors': true})).drawn, isTrue);
    });
  });

  group('PortalComponent.swingSign', () {
    // Where the open leaf points: wall angle + sign × 90°, as a unit vector.
    Offset openDir(double wallAngle) {
      final a = wallAngle + PortalComponent.swingSign(wallAngle) * pi / 2;
      return Offset(cos(a), sin(a));
    }

    test('east–west wall opens south, from either hinge', () {
      expect(openDir(0).dy, closeTo(1, 1e-9)); // hinge west
      expect(openDir(pi).dy, closeTo(1, 1e-9)); // hinge east (double door)
    });

    test('north–south wall opens east, from either hinge', () {
      expect(openDir(pi / 2).dx, closeTo(1, 1e-9)); // hinge north
      expect(openDir(-pi / 2).dx, closeTo(1, 1e-9)); // hinge south
    });
  });

  group('DoorSwing', () {
    test('starts at rest — no swing on map load', () {
      expect(DoorSwing(open: false).angle, 0);
      expect(DoorSwing(open: true).angle, closeTo(DoorSwing.openAngle, 1e-9));
    });

    test('opens over its duration and stops there', () {
      final s = DoorSwing(open: false);
      s.step(DoorSwing.duration / 2, open: true);
      expect(s.t, closeTo(0.5, 1e-9));
      expect(s.angle, closeTo(DoorSwing.openAngle / 2, 1e-9)); // ease is symmetric
      s.step(DoorSwing.duration, open: true);
      expect(s.t, 1.0);
      expect(s.angle, closeTo(DoorSwing.openAngle, 1e-9));
    });

    test('eases: slow at the start', () {
      final s = DoorSwing(open: false)..step(DoorSwing.duration / 10, open: true);
      expect(s.angle, lessThan(DoorSwing.openAngle / 10));
    });

    test('a toggle mid-swing turns back from where it is', () {
      final s = DoorSwing(open: false)
        ..step(DoorSwing.duration * 0.6, open: true)
        ..step(DoorSwing.duration * 0.2, open: false);
      expect(s.t, closeTo(0.4, 1e-9));
      s.step(DoorSwing.duration, open: false);
      expect(s.t, 0.0);
    });

    test('open angle stays short of a right angle', () {
      expect(DoorSwing.openAngle, lessThan(pi / 2));
      expect(DoorSwing.openAngle, greaterThan(pi / 3));
    });
  });
}
