import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/aoe_template.dart';

void main() {
  group('AoeShape enum', () {
    test('has all four expected values', () {
      expect(AoeShape.values.length, 4);
      expect(AoeShape.values, contains(AoeShape.circle));
      expect(AoeShape.values, contains(AoeShape.cone));
      expect(AoeShape.values, contains(AoeShape.line));
      expect(AoeShape.values, contains(AoeShape.square));
    });

    test('enum names match expected strings', () {
      expect(AoeShape.circle.name, 'circle');
      expect(AoeShape.cone.name, 'cone');
      expect(AoeShape.line.name, 'line');
      expect(AoeShape.square.name, 'square');
    });
  });

  group('AoeTemplate serialization round-trip', () {
    test('circle template round-trips through toJson/fromJson', () {
      final original = AoeTemplate(
        shape: AoeShape.circle,
        originX: 5.0,
        originY: 3.5,
        radius: 4.0,
        angle: 1.57,
      );

      final json = original.toJson();
      final restored = AoeTemplate.fromJson(json);

      expect(restored.shape, AoeShape.circle);
      expect(restored.originX, 5.0);
      expect(restored.originY, 3.5);
      expect(restored.radius, 4.0);
      expect(restored.angle, 1.57);
    });

    test('cone template round-trips through toJson/fromJson', () {
      final original = AoeTemplate(
        shape: AoeShape.cone,
        originX: 10.0,
        originY: 8.0,
        radius: 3.0,
        angle: 3.14,
      );

      final json = original.toJson();
      final restored = AoeTemplate.fromJson(json);

      expect(restored.shape, AoeShape.cone);
      expect(restored.originX, 10.0);
      expect(restored.originY, 8.0);
      expect(restored.radius, 3.0);
      expect(restored.angle, 3.14);
    });

    test('line template round-trips through toJson/fromJson', () {
      final original = AoeTemplate(
        shape: AoeShape.line,
        originX: 0.0,
        originY: 0.0,
        radius: 6.0,
        angle: 0.5,
      );

      final json = original.toJson();
      final restored = AoeTemplate.fromJson(json);

      expect(restored.shape, AoeShape.line);
      expect(restored.originX, 0.0);
      expect(restored.originY, 0.0);
      expect(restored.radius, 6.0);
      expect(restored.angle, 0.5);
    });

    test('square template round-trips through toJson/fromJson', () {
      final original = AoeTemplate(
        shape: AoeShape.square,
        originX: 7.5,
        originY: 2.0,
        radius: 2.0,
      );

      final json = original.toJson();
      final restored = AoeTemplate.fromJson(json);

      expect(restored.shape, AoeShape.square);
      expect(restored.originX, 7.5);
      expect(restored.originY, 2.0);
      expect(restored.radius, 2.0);
    });
  });

  group('AoeTemplate default angle', () {
    test('angle defaults to 0 when not specified', () {
      final template = AoeTemplate(
        shape: AoeShape.circle,
        originX: 1.0,
        originY: 2.0,
        radius: 3.0,
      );

      expect(template.angle, 0);
    });

    test('toJson includes angle even when default', () {
      final template = AoeTemplate(
        shape: AoeShape.circle,
        originX: 1.0,
        originY: 2.0,
        radius: 3.0,
      );

      final json = template.toJson();
      expect(json.containsKey('angle'), true);
      expect(json['angle'], 0);
    });
  });

  group('AoeTemplate backwards compatibility', () {
    test('fromJson defaults angle to 0 when missing from JSON', () {
      final json = {
        'shape': 'cone',
        'originX': 5.0,
        'originY': 3.0,
        'radius': 4.0,
        // No 'angle' key
      };

      final template = AoeTemplate.fromJson(json);

      expect(template.shape, AoeShape.cone);
      expect(template.originX, 5.0);
      expect(template.originY, 3.0);
      expect(template.radius, 4.0);
      expect(template.angle, 0);
    });

    test('fromJson defaults to circle for unrecognized shape', () {
      final json = {
        'shape': 'hexagon',
        'originX': 1.0,
        'originY': 2.0,
        'radius': 3.0,
        'angle': 0.5,
      };

      final template = AoeTemplate.fromJson(json);
      expect(template.shape, AoeShape.circle);
    });
  });

  group('AoeTemplate toJson structure', () {
    test('toJson produces expected keys', () {
      final template = AoeTemplate(
        shape: AoeShape.cone,
        originX: 1.0,
        originY: 2.0,
        radius: 3.0,
        angle: 1.5,
      );

      final json = template.toJson();

      expect(json.containsKey('shape'), true);
      expect(json.containsKey('originX'), true);
      expect(json.containsKey('originY'), true);
      expect(json.containsKey('radius'), true);
      expect(json.containsKey('angle'), true);
      expect(json['shape'], 'cone');
    });
  });
}
