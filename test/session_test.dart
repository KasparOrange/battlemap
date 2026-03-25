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
        // No tokenData, strokeData, drawColorValue, drawWidth, interactionMode
      };

      final restored = Session.fromJson(oldJson);

      expect(restored.tokenData, isEmpty);
      expect(restored.strokeData, isEmpty);
      expect(restored.drawColorValue, 0xFFE53935);
      expect(restored.drawWidth, 3.0);
      expect(restored.interactionMode, 'fogReveal');
    });
  });
}
