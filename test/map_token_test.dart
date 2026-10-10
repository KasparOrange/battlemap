import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/map_token.dart';

void main() {
  group('MapToken toJson / fromJson round-trip', () {
    test('round-trip preserves all fields including combat metadata', () {
      final token = MapToken(
        id: 'token_123',
        label: '1',
        color: const Color(0xFFE53935),
        gridX: 5,
        gridY: 7,
        name: 'Goblin Archer',
        maxHp: 30,
        currentHp: 22,
        conditions: {'poisoned', 'prone'},
      );

      final json = token.toJson();
      final restored = MapToken.fromJson(json);

      expect(restored.id, 'token_123');
      expect(restored.label, '1');
      expect(restored.color, const Color(0xFFE53935));
      expect(restored.gridX, 5);
      expect(restored.gridY, 7);
      expect(restored.name, 'Goblin Archer');
      expect(restored.maxHp, 30);
      expect(restored.currentHp, 22);
      expect(restored.conditions, {'poisoned', 'prone'});
    });

    test('round-trip with empty conditions', () {
      final token = MapToken(
        id: 'token_456',
        label: '2',
        color: const Color(0xFF43A047),
        gridX: 0,
        gridY: 0,
        name: 'Orc',
        maxHp: 15,
        currentHp: 15,
      );

      final json = token.toJson();
      final restored = MapToken.fromJson(json);

      expect(restored.name, 'Orc');
      expect(restored.maxHp, 15);
      expect(restored.currentHp, 15);
      expect(restored.conditions, isEmpty);
    });
  });

  group('MapToken backwards compatibility', () {
    test('fromJson with old JSON missing name/HP/conditions uses defaults', () {
      final oldJson = {
        'id': 'token_old',
        'label': '3',
        'color': 'ff1e88e5',
        'gridX': 2,
        'gridY': 3,
        // No name, maxHp, currentHp, or conditions
      };

      final token = MapToken.fromJson(oldJson);

      expect(token.id, 'token_old');
      expect(token.label, '3');
      expect(token.gridX, 2);
      expect(token.gridY, 3);
      expect(token.name, '');
      expect(token.maxHp, 0);
      expect(token.currentHp, 0);
      expect(token.conditions, isEmpty);
    });
  });

  group('conditionColors', () {
    test('contains all 10 standard conditions', () {
      expect(MapToken.conditionColors.length, 10);
      expect(MapToken.conditionColors.containsKey('poisoned'), true);
      expect(MapToken.conditionColors.containsKey('stunned'), true);
      expect(MapToken.conditionColors.containsKey('frightened'), true);
      expect(MapToken.conditionColors.containsKey('prone'), true);
      expect(MapToken.conditionColors.containsKey('concentrating'), true);
      expect(MapToken.conditionColors.containsKey('blinded'), true);
      expect(MapToken.conditionColors.containsKey('charmed'), true);
      expect(MapToken.conditionColors.containsKey('restrained'), true);
      expect(MapToken.conditionColors.containsKey('invisible'), true);
      expect(MapToken.conditionColors.containsKey('unconscious'), true);
    });

    test('all condition color values are valid ARGB integers', () {
      for (final entry in MapToken.conditionColors.entries) {
        expect(entry.value, greaterThan(0),
            reason: '${entry.key} color should be a positive integer');
        // Verify it can construct a Color without error
        final color = Color(entry.value);
        expect(color.a, greaterThan(0),
            reason: '${entry.key} color should have non-zero alpha');
      }
    });
  });

  group('MapToken constructor defaults', () {
    test('combat fields default to empty/zero', () {
      final token = MapToken(
        id: 'test',
        label: '1',
        color: const Color(0xFFE53935),
        gridX: 0,
        gridY: 0,
      );

      expect(token.name, '');
      expect(token.maxHp, 0);
      expect(token.currentHp, 0);
      expect(token.conditions, isEmpty);
    });
  });
}
