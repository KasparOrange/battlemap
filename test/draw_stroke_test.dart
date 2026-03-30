import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/draw_stroke.dart';

void main() {
  group('DrawStroke serialization round-trip', () {
    test('round-trip preserves points, color, and width', () {
      final original = DrawStroke(
        points: [
          const Offset(10.5, 20.3),
          const Offset(30.0, 40.7),
          const Offset(50.1, 60.9),
        ],
        color: const Color(0xFFE53935),
        width: 3.5,
      );

      final json = original.toJson();
      final restored = DrawStroke.fromJson(json);

      expect(restored.points.length, 3);
      expect(restored.points[0].dx, 10.5);
      expect(restored.points[0].dy, 20.3);
      expect(restored.points[1].dx, 30.0);
      expect(restored.points[1].dy, 40.7);
      expect(restored.points[2].dx, 50.1);
      expect(restored.points[2].dy, 60.9);
      expect(restored.color, const Color(0xFFE53935));
      expect(restored.width, 3.5);
    });

    test('round-trip with single point', () {
      final original = DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFF00FF00),
        width: 1.0,
      );

      final json = original.toJson();
      final restored = DrawStroke.fromJson(json);

      expect(restored.points.length, 1);
      expect(restored.points.first.dx, 0);
      expect(restored.points.first.dy, 0);
      expect(restored.color, const Color(0xFF00FF00));
      expect(restored.width, 1.0);
    });
  });

  group('DrawStroke empty points list', () {
    test('round-trip with empty points list', () {
      final original = DrawStroke(
        points: [],
        color: const Color(0xFFFF0000),
        width: 2.0,
      );

      final json = original.toJson();
      final restored = DrawStroke.fromJson(json);

      expect(restored.points, isEmpty);
      expect(restored.color, const Color(0xFFFF0000));
      expect(restored.width, 2.0);
    });
  });

  group('DrawStroke color encoding', () {
    test('color is stored as hex string in JSON', () {
      final stroke = DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFFE53935),
        width: 1.0,
      );

      final json = stroke.toJson();
      expect(json['color'], isA<String>());
      expect(json['color'], 'ffe53935');
    });

    test('fully transparent color round-trips correctly', () {
      final stroke = DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0x00000000),
        width: 1.0,
      );

      final json = stroke.toJson();
      expect(json['color'], '00000000');

      final restored = DrawStroke.fromJson(json);
      expect(restored.color, const Color(0x00000000));
    });

    test('white color round-trips correctly', () {
      final stroke = DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFFFFFFFF),
        width: 1.0,
      );

      final json = stroke.toJson();
      expect(json['color'], 'ffffffff');

      final restored = DrawStroke.fromJson(json);
      expect(restored.color, const Color(0xFFFFFFFF));
    });

    test('semi-transparent color round-trips correctly', () {
      final stroke = DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0x801E88E5),
        width: 1.0,
      );

      final json = stroke.toJson();
      final restored = DrawStroke.fromJson(json);
      expect(restored.color, const Color(0x801E88E5));
    });
  });

  group('DrawStroke toJson structure', () {
    test('toJson produces expected keys', () {
      final stroke = DrawStroke(
        points: [const Offset(1, 2), const Offset(3, 4)],
        color: const Color(0xFF000000),
        width: 5.0,
      );

      final json = stroke.toJson();

      expect(json.containsKey('points'), true);
      expect(json.containsKey('color'), true);
      expect(json.containsKey('width'), true);
    });

    test('points are encoded as [dx, dy] arrays', () {
      final stroke = DrawStroke(
        points: [const Offset(1.5, 2.5)],
        color: const Color(0xFF000000),
        width: 1.0,
      );

      final json = stroke.toJson();
      final points = json['points'] as List;
      expect(points.length, 1);
      expect(points[0], [1.5, 2.5]);
    });

    test('width is stored as a number', () {
      final stroke = DrawStroke(
        points: [],
        color: const Color(0xFF000000),
        width: 7.5,
      );

      final json = stroke.toJson();
      expect(json['width'], 7.5);
    });
  });
}
