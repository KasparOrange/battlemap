import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/session.dart';

/// Tests for [SessionSettings] presets, JSON round-trip, and backwards
/// compatibility with sessions saved before settings existed.
void main() {
  group('SessionSettings.penAndPaper preset', () {
    final s = SessionSettings.penAndPaper();

    test('enables map visuals: fog, drawing, doors, measurement', () {
      expect(s.fogOfWar, isTrue);
      expect(s.drawingTools, isTrue);
      expect(s.doorToggles, isTrue);
      expect(s.measureTool, isTrue);
    });

    test('disables digital combat features', () {
      expect(s.tokens, isFalse);
      expect(s.hpBars, isFalse);
      expect(s.conditions, isFalse);
      expect(s.aoeTemplates, isFalse);
      expect(s.initiativeTracker, isFalse);
    });

    test('shadow mode and ruler default to off', () {
      expect(s.shadowMode, isFalse);
      expect(s.ruler, isFalse);
    });

    test('atmosphere features default to safe defaults', () {
      // Sound/weather/light animations are forward-looking; off by default.
      expect(s.ambientSound, isFalse);
      expect(s.weatherEffects, isFalse);
      expect(s.lightAnimations, isFalse);
      // Visual effects that are already implemented default ON.
      expect(s.fogMode, 'standard');
      expect(s.fogAnimation, isTrue);
      expect(s.globalEffects, isTrue);
    });
  });

  group('SessionSettings.digital preset', () {
    final s = SessionSettings.digital();

    test('enables full digital combat suite', () {
      expect(s.tokens, isTrue);
      expect(s.hpBars, isTrue);
      expect(s.conditions, isTrue);
      expect(s.aoeTemplates, isTrue);
    });

    test('keeps map visuals enabled too', () {
      expect(s.fogOfWar, isTrue);
      expect(s.drawingTools, isTrue);
      expect(s.doorToggles, isTrue);
      expect(s.measureTool, isTrue);
    });

    test('initiative tracker is still off (future feature)', () {
      expect(s.initiativeTracker, isFalse);
    });
  });

  group('SessionSettings JSON round-trip', () {
    test('penAndPaper preset round-trips identically', () {
      final original = SessionSettings.penAndPaper();
      final restored = SessionSettings.fromJson(original.toJson());
      _expectEquivalent(restored, original);
    });

    test('digital preset round-trips identically', () {
      final original = SessionSettings.digital();
      final restored = SessionSettings.fromJson(original.toJson());
      _expectEquivalent(restored, original);
    });

    test('mutated preset round-trips identically', () {
      final original = SessionSettings.penAndPaper()
        ..tokens = true
        ..ruler = true
        ..fogMode = 'cloud'
        ..fogAnimation = false
        ..globalEffects = false;
      final restored = SessionSettings.fromJson(original.toJson());
      _expectEquivalent(restored, original);
    });

    test('all 17 fields are present in toJson output', () {
      final json = SessionSettings.penAndPaper().toJson();
      const expectedKeys = {
        'fogOfWar',
        'shadowMode',
        'drawingTools',
        'tokens',
        'measureTool',
        'ruler',
        'doorToggles',
        'hpBars',
        'conditions',
        'aoeTemplates',
        'initiativeTracker',
        'ambientSound',
        'weatherEffects',
        'lightAnimations',
        'fogMode',
        'fogAnimation',
        'globalEffects',
      };
      expect(json.keys.toSet(), expectedKeys);
    });
  });

  group('SessionSettings backwards compatibility', () {
    test('empty JSON falls back to penAndPaper defaults', () {
      final restored = SessionSettings.fromJson({});
      _expectEquivalent(restored, SessionSettings.penAndPaper());
    });

    test('partial JSON keeps defaults for missing fields', () {
      final restored = SessionSettings.fromJson({
        'tokens': true,
        'hpBars': true,
      });
      // Provided fields applied
      expect(restored.tokens, isTrue);
      expect(restored.hpBars, isTrue);
      // Other fields kept their PnP defaults
      expect(restored.fogOfWar, isTrue);
      expect(restored.measureTool, isTrue);
      expect(restored.aoeTemplates, isFalse);
    });

    test('unknown fogMode strings round-trip as-is (no validation)', () {
      // The setting is intentionally permissive — new modes can be added
      // without breaking older sessions.
      final s = SessionSettings.fromJson({'fogMode': 'gibberish'});
      expect(s.fogMode, 'gibberish');
    });

    test('null JSON values fall back to defaults', () {
      final restored = SessionSettings.fromJson({
        'fogOfWar': null,
        'fogMode': null,
      });
      expect(restored.fogOfWar, isTrue); // default
      expect(restored.fogMode, 'standard'); // default
    });
  });

  group('SessionSettings.copy', () {
    test('produces an independent instance', () {
      final original = SessionSettings.digital();
      final copy = original.copy();
      _expectEquivalent(copy, original);
      // Mutating the copy must not affect the original.
      copy.tokens = false;
      expect(original.tokens, isTrue);
    });
  });

  group('Session.toJson includes settings', () {
    test('settings are nested under "settings" key', () {
      final session = Session(
        id: 'sid',
        mapId: 'mid',
        name: 'Test Session',
        createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
        lastModifiedAt: DateTime.parse('2026-01-02T00:00:00Z'),
        settings: SessionSettings.digital(),
      );
      final json = session.toJson();
      expect(json['settings'], isA<Map<String, dynamic>>());
      expect((json['settings'] as Map)['tokens'], isTrue);
    });

    test('Session.fromJson restores settings', () {
      final session = Session(
        id: 'sid',
        mapId: 'mid',
        name: 'Test Session',
        createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
        lastModifiedAt: DateTime.parse('2026-01-02T00:00:00Z'),
        settings: SessionSettings.digital(),
      );
      final restored = Session.fromJson(session.toJson());
      _expectEquivalent(restored.settings, SessionSettings.digital());
    });

    test('Session.fromJson with absent settings uses penAndPaper defaults', () {
      final session = Session(
        id: 'sid',
        mapId: 'mid',
        name: 'Old session',
        createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
        lastModifiedAt: DateTime.parse('2026-01-02T00:00:00Z'),
      );
      final json = Map<String, dynamic>.from(session.toJson())
        ..remove('settings');
      final restored = Session.fromJson(json);
      _expectEquivalent(restored.settings, SessionSettings.penAndPaper());
    });
  });
}

/// Verifies every field of [actual] matches [expected].
///
/// Used by JSON round-trip and copy tests so a missing field on either side
/// causes an immediate, named failure rather than a generic equality miss.
void _expectEquivalent(SessionSettings actual, SessionSettings expected) {
  expect(actual.fogOfWar, expected.fogOfWar, reason: 'fogOfWar');
  expect(actual.shadowMode, expected.shadowMode, reason: 'shadowMode');
  expect(actual.drawingTools, expected.drawingTools, reason: 'drawingTools');
  expect(actual.tokens, expected.tokens, reason: 'tokens');
  expect(actual.measureTool, expected.measureTool, reason: 'measureTool');
  expect(actual.ruler, expected.ruler, reason: 'ruler');
  expect(actual.doorToggles, expected.doorToggles, reason: 'doorToggles');
  expect(actual.hpBars, expected.hpBars, reason: 'hpBars');
  expect(actual.conditions, expected.conditions, reason: 'conditions');
  expect(actual.aoeTemplates, expected.aoeTemplates, reason: 'aoeTemplates');
  expect(actual.initiativeTracker, expected.initiativeTracker,
      reason: 'initiativeTracker');
  expect(actual.ambientSound, expected.ambientSound, reason: 'ambientSound');
  expect(actual.weatherEffects, expected.weatherEffects, reason: 'weatherEffects');
  expect(actual.lightAnimations, expected.lightAnimations,
      reason: 'lightAnimations');
  expect(actual.fogMode, expected.fogMode, reason: 'fogMode');
  expect(actual.fogAnimation, expected.fogAnimation, reason: 'fogAnimation');
  expect(actual.globalEffects, expected.globalEffects, reason: 'globalEffects');
}
