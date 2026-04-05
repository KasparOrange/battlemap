import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/session.dart';

void main() {
  group('Session serialization round-trip', () {
    test('all fields survive toJson/fromJson', () {
      final original = Session(
        id: 'session-abc-123',
        mapId: 'map-xyz-456',
        name: 'Dragon Lair Session 3',
        createdAt: DateTime.utc(2026, 1, 15, 10, 30, 0),
        lastModifiedAt: DateTime.utc(2026, 3, 20, 14, 45, 30),
        thumbnailPath: '/data/thumbnails/session-abc-123.png',
        revealedCells: [0, 5, 10, 42, 99],
        openPortals: [1, 3],
        showGrid: false,
        fogEnabled: false,
        showWalls: true,
        brushRadius: 3,
        revealMode: false,
        tvWidthInches: 43.0,
        calibratedBaseZoom: 2.5,
        tokenData: [
          {'id': 'tk1', 'label': '1', 'color': 'ffe53935', 'gridX': 3, 'gridY': 4},
        ],
        strokeData: [
          {'points': [[1.0, 2.0], [3.0, 4.0]], 'color': 'ff1e88e5', 'width': 2.0},
        ],
        drawColorValue: 0xFF43A047,
        drawWidth: 5.0,
        interactionMode: 'draw',
        cameraX: -150.0,
        cameraY: 200.5,
        cameraZoom: 0.75,
        cameraAngle: 45.0,
      );

      final json = original.toJson();
      final restored = Session.fromJson(json);

      expect(restored.id, original.id);
      expect(restored.mapId, original.mapId);
      expect(restored.name, original.name);
      expect(restored.createdAt, original.createdAt);
      expect(restored.lastModifiedAt, original.lastModifiedAt);
      expect(restored.thumbnailPath, original.thumbnailPath);
      expect(restored.revealedCells, original.revealedCells);
      expect(restored.openPortals, original.openPortals);
      expect(restored.showGrid, original.showGrid);
      expect(restored.fogEnabled, original.fogEnabled);
      expect(restored.showWalls, original.showWalls);
      expect(restored.brushRadius, original.brushRadius);
      expect(restored.revealMode, original.revealMode);
      expect(restored.tvWidthInches, original.tvWidthInches);
      expect(restored.calibratedBaseZoom, original.calibratedBaseZoom);
      expect(restored.tokenData.length, 1);
      expect(restored.tokenData.first['id'], 'tk1');
      expect(restored.strokeData.length, 1);
      expect(restored.strokeData.first['width'], 2.0);
      expect(restored.drawColorValue, 0xFF43A047);
      expect(restored.drawWidth, 5.0);
      expect(restored.interactionMode, 'draw');
      expect(restored.cameraX, original.cameraX);
      expect(restored.cameraY, original.cameraY);
      expect(restored.cameraZoom, original.cameraZoom);
      expect(restored.cameraAngle, original.cameraAngle);
    });

    test('null optional fields survive round-trip', () {
      final original = Session(
        id: 'session-minimal',
        mapId: 'map-001',
        name: 'Quick Test',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
        // thumbnailPath, tvWidthInches, calibratedBaseZoom all null by default
      );

      final json = original.toJson();
      final restored = Session.fromJson(json);

      expect(restored.thumbnailPath, isNull);
      expect(restored.tvWidthInches, isNull);
      expect(restored.calibratedBaseZoom, isNull);
    });

    test('default values match when using defaults', () {
      final original = Session(
        id: 'session-defaults',
        mapId: 'map-defaults',
        name: 'Defaults Test',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );

      final json = original.toJson();
      final restored = Session.fromJson(json);

      expect(restored.revealedCells, isEmpty);
      expect(restored.openPortals, isEmpty);
      expect(restored.showGrid, true);
      expect(restored.fogEnabled, true);
      expect(restored.showWalls, false);
      expect(restored.brushRadius, 1);
      expect(restored.revealMode, true);
      expect(restored.tokenData, isEmpty);
      expect(restored.strokeData, isEmpty);
      expect(restored.drawColorValue, 0xFFE53935);
      expect(restored.drawWidth, 3.0);
      expect(restored.interactionMode, 'fogReveal');
      expect(restored.cameraX, 0);
      expect(restored.cameraY, 0);
      expect(restored.cameraZoom, 1);
      expect(restored.cameraAngle, 0);
    });

    test('toJson produces expected keys', () {
      final session = Session(
        id: 'test-id',
        mapId: 'test-map',
        name: 'Test',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );

      final json = session.toJson();

      expect(json.containsKey('id'), true);
      expect(json.containsKey('mapId'), true);
      expect(json.containsKey('name'), true);
      expect(json.containsKey('createdAt'), true);
      expect(json.containsKey('lastModifiedAt'), true);
      expect(json.containsKey('thumbnailPath'), true);
      expect(json.containsKey('revealedCells'), true);
      expect(json.containsKey('openPortals'), true);
      expect(json.containsKey('showGrid'), true);
      expect(json.containsKey('fogEnabled'), true);
      expect(json.containsKey('showWalls'), true);
      expect(json.containsKey('brushRadius'), true);
      expect(json.containsKey('revealMode'), true);
      expect(json.containsKey('tvWidthInches'), true);
      expect(json.containsKey('calibratedBaseZoom'), true);
      expect(json.containsKey('tokenData'), true);
      expect(json.containsKey('strokeData'), true);
      expect(json.containsKey('drawColorValue'), true);
      expect(json.containsKey('drawWidth'), true);
      expect(json.containsKey('interactionMode'), true);
      expect(json.containsKey('cameraX'), true);
      expect(json.containsKey('cameraY'), true);
      expect(json.containsKey('cameraZoom'), true);
      expect(json.containsKey('cameraAngle'), true);
    });
    test('fromJson backwards compatible with old JSON missing new fields', () {
      // Simulate an old session JSON without tokenData/strokeData/draw fields
      final oldJson = {
        'id': 'old-session',
        'mapId': 'old-map',
        'name': 'Old Session',
        'createdAt': '2026-01-01T00:00:00.000Z',
        'lastModifiedAt': '2026-01-01T00:00:00.000Z',
        'thumbnailPath': null,
        'revealedCells': <int>[],
        'openPortals': <int>[],
        'showGrid': true,
        'fogEnabled': true,
        'showWalls': false,
        'brushRadius': 1,
        'revealMode': true,
        'tvWidthInches': null,
        'calibratedBaseZoom': null,
        'cameraX': 0,
        'cameraY': 0,
        'cameraZoom': 1,
        'cameraAngle': 0,
        // No tokenData, strokeData, drawColorValue, drawWidth, interactionMode, isPdfSession
      };

      final restored = Session.fromJson(oldJson);

      expect(restored.tokenData, isEmpty);
      expect(restored.strokeData, isEmpty);
      expect(restored.drawColorValue, 0xFFE53935);
      expect(restored.drawWidth, 3.0);
      expect(restored.interactionMode, 'fogReveal');
      expect(restored.isPdfSession, false);
    });

    test('isPdfSession round-trips correctly when true', () {
      final original = Session(
        id: 'pdf-session-001',
        mapId: 'pdf-map-001',
        name: 'PDF Dungeon Session',
        createdAt: DateTime.utc(2026, 3, 27),
        lastModifiedAt: DateTime.utc(2026, 3, 27),
        isPdfSession: true,
      );

      final json = original.toJson();
      final restored = Session.fromJson(json);

      expect(restored.isPdfSession, true);
      expect(json['isPdfSession'], true);
    });

    test('isPdfSession defaults to false for non-PDF sessions', () {
      final original = Session(
        id: 'uvtt-session-001',
        mapId: 'uvtt-map-001',
        name: 'UVTT Session',
        createdAt: DateTime.utc(2026, 3, 27),
        lastModifiedAt: DateTime.utc(2026, 3, 27),
      );

      final json = original.toJson();
      final restored = Session.fromJson(json);

      expect(restored.isPdfSession, false);
      expect(json['isPdfSession'], false);
    });

    test('toJson includes isPdfSession key', () {
      final session = Session(
        id: 'test-id',
        mapId: 'test-map',
        name: 'Test',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );

      final json = session.toJson();
      expect(json.containsKey('isPdfSession'), true);
    });

    test('settings field round-trips correctly', () {
      final original = Session(
        id: 'settings-session',
        mapId: 'map-001',
        name: 'Settings Test',
        createdAt: DateTime.utc(2026, 4, 1),
        lastModifiedAt: DateTime.utc(2026, 4, 1),
        settings: SessionSettings.digital(),
      );

      final json = original.toJson();
      final restored = Session.fromJson(json);

      expect(restored.settings.fogOfWar, true);
      expect(restored.settings.tokens, true);
      expect(restored.settings.hpBars, true);
      expect(restored.settings.conditions, true);
      expect(restored.settings.aoeTemplates, true);
      expect(restored.settings.drawingTools, true);
      expect(restored.settings.measureTool, true);
      expect(restored.settings.doorToggles, true);
    });

    test('settings defaults to penAndPaper when absent', () {
      final oldJson = {
        'id': 'old-no-settings',
        'mapId': 'map-002',
        'name': 'Old No Settings',
        'createdAt': '2026-01-01T00:00:00.000Z',
        'lastModifiedAt': '2026-01-01T00:00:00.000Z',
        'thumbnailPath': null,
        'revealedCells': <int>[],
        'openPortals': <int>[],
        'showGrid': true,
        'fogEnabled': true,
        'showWalls': false,
        'brushRadius': 1,
        'revealMode': true,
        'tvWidthInches': null,
        'calibratedBaseZoom': null,
        'cameraX': 0,
        'cameraY': 0,
        'cameraZoom': 1,
        'cameraAngle': 0,
        // No 'settings' key
      };

      final restored = Session.fromJson(oldJson);

      expect(restored.settings.fogOfWar, true);
      expect(restored.settings.tokens, false);
      expect(restored.settings.hpBars, false);
      expect(restored.settings.conditions, false);
      expect(restored.settings.aoeTemplates, false);
      expect(restored.settings.drawingTools, true);
    });
  });

  group('SessionSettings', () {
    test('toJson/fromJson round-trip', () {
      final original = SessionSettings(
        fogOfWar: true,
        shadowMode: true,
        drawingTools: false,
        tokens: true,
        measureTool: false,
        ruler: true,
        doorToggles: false,
        hpBars: true,
        conditions: true,
        aoeTemplates: false,
        initiativeTracker: true,
        ambientSound: true,
        weatherEffects: false,
        lightAnimations: true,
        fogMode: 'soft',
        fogAnimation: false,
        globalEffects: false,
      );

      final json = original.toJson();
      final restored = SessionSettings.fromJson(json);

      expect(restored.fogOfWar, original.fogOfWar);
      expect(restored.shadowMode, original.shadowMode);
      expect(restored.drawingTools, original.drawingTools);
      expect(restored.tokens, original.tokens);
      expect(restored.measureTool, original.measureTool);
      expect(restored.ruler, original.ruler);
      expect(restored.doorToggles, original.doorToggles);
      expect(restored.hpBars, original.hpBars);
      expect(restored.conditions, original.conditions);
      expect(restored.aoeTemplates, original.aoeTemplates);
      expect(restored.initiativeTracker, original.initiativeTracker);
      expect(restored.ambientSound, original.ambientSound);
      expect(restored.weatherEffects, original.weatherEffects);
      expect(restored.lightAnimations, original.lightAnimations);
      expect(restored.fogMode, original.fogMode);
      expect(restored.fogAnimation, original.fogAnimation);
      expect(restored.globalEffects, original.globalEffects);
    });

    test('penAndPaper preset has correct values', () {
      final pp = SessionSettings.penAndPaper();

      expect(pp.fogOfWar, true);
      expect(pp.shadowMode, false);
      expect(pp.drawingTools, true);
      expect(pp.tokens, false);
      expect(pp.measureTool, true);
      expect(pp.ruler, false);
      expect(pp.doorToggles, true);
      expect(pp.hpBars, false);
      expect(pp.conditions, false);
      expect(pp.aoeTemplates, false);
      expect(pp.initiativeTracker, false);
      expect(pp.ambientSound, false);
      expect(pp.weatherEffects, false);
      expect(pp.lightAnimations, false);
    });

    test('digital preset has correct values', () {
      final dg = SessionSettings.digital();

      expect(dg.fogOfWar, true);
      expect(dg.shadowMode, false);
      expect(dg.drawingTools, true);
      expect(dg.tokens, true);
      expect(dg.measureTool, true);
      expect(dg.ruler, false);
      expect(dg.doorToggles, true);
      expect(dg.hpBars, true);
      expect(dg.conditions, true);
      expect(dg.aoeTemplates, true);
      expect(dg.initiativeTracker, false);
      expect(dg.ambientSound, false);
      expect(dg.weatherEffects, false);
      expect(dg.lightAnimations, false);
    });

    test('backwards compatibility - fromJson with empty map', () {
      final restored = SessionSettings.fromJson({});

      // Should default to penAndPaper values
      expect(restored.fogOfWar, true);
      expect(restored.shadowMode, false);
      expect(restored.drawingTools, true);
      expect(restored.tokens, false);
      expect(restored.measureTool, true);
      expect(restored.ruler, false);
      expect(restored.doorToggles, true);
      expect(restored.hpBars, false);
      expect(restored.conditions, false);
      expect(restored.aoeTemplates, false);
    });

    test('copy creates independent instance', () {
      final original = SessionSettings.digital();
      final copy = original.copy();

      copy.tokens = false;
      copy.hpBars = false;

      expect(original.tokens, true);
      expect(original.hpBars, true);
      expect(copy.tokens, false);
      expect(copy.hpBars, false);
    });

    test('toJson produces expected keys', () {
      final json = SessionSettings().toJson();

      expect(json.containsKey('fogOfWar'), true);
      expect(json.containsKey('shadowMode'), true);
      expect(json.containsKey('drawingTools'), true);
      expect(json.containsKey('tokens'), true);
      expect(json.containsKey('measureTool'), true);
      expect(json.containsKey('ruler'), true);
      expect(json.containsKey('doorToggles'), true);
      expect(json.containsKey('hpBars'), true);
      expect(json.containsKey('conditions'), true);
      expect(json.containsKey('aoeTemplates'), true);
      expect(json.containsKey('initiativeTracker'), true);
      expect(json.containsKey('ambientSound'), true);
      expect(json.containsKey('weatherEffects'), true);
      expect(json.containsKey('lightAnimations'), true);
      expect(json.containsKey('fogMode'), true);
      expect(json.containsKey('fogAnimation'), true);
      expect(json.containsKey('globalEffects'), true);
    });

    test('fog mode serialization round-trip', () {
      final original = SessionSettings(
        fogMode: 'cloud',
        fogAnimation: false,
        globalEffects: false,
      );

      final json = original.toJson();
      final restored = SessionSettings.fromJson(json);

      expect(restored.fogMode, 'cloud');
      expect(restored.fogAnimation, false);
      expect(restored.globalEffects, false);
    });

    test('fog mode defaults for backwards compatibility', () {
      final restored = SessionSettings.fromJson({});

      expect(restored.fogMode, 'standard');
      expect(restored.fogAnimation, true);
      expect(restored.globalEffects, true);
    });

    test('all four fog modes round-trip correctly', () {
      for (final mode in ['standard', 'soft', 'cloud', 'atmospheric']) {
        final settings = SessionSettings(fogMode: mode);
        final json = settings.toJson();
        final restored = SessionSettings.fromJson(json);
        expect(restored.fogMode, mode);
      }
    });

    test('copy preserves fog mode fields', () {
      final original = SessionSettings(
        fogMode: 'atmospheric',
        fogAnimation: false,
        globalEffects: false,
      );
      final copy = original.copy();

      expect(copy.fogMode, 'atmospheric');
      expect(copy.fogAnimation, false);
      expect(copy.globalEffects, false);

      // Verify independence
      copy.fogMode = 'standard';
      expect(original.fogMode, 'atmospheric');
    });
  });
}
