import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/map_library_entry.dart';

void main() {
  group('MapLibraryEntry serialization round-trip', () {
    test('all fields survive toJson/fromJson', () {
      final original = MapLibraryEntry(
        id: 'abc-123-def',
        displayName: 'Dragon Lair Level 2',
        fileSizeBytes: 2048576,
        gridCols: 24,
        gridRows: 16,
        portalCount: 5,
        addedAt: DateTime.utc(2026, 3, 15, 12, 0, 0),
        thumbnailPath: '/data/thumbnails/abc-123-def.png',
      );

      final json = original.toJson();
      final restored = MapLibraryEntry.fromJson(json);

      expect(restored.id, original.id);
      expect(restored.displayName, original.displayName);
      expect(restored.fileSizeBytes, original.fileSizeBytes);
      expect(restored.gridCols, original.gridCols);
      expect(restored.gridRows, original.gridRows);
      expect(restored.portalCount, original.portalCount);
      expect(restored.addedAt, original.addedAt);
      expect(restored.thumbnailPath, original.thumbnailPath);
    });

    test('null thumbnailPath survives round-trip', () {
      final original = MapLibraryEntry(
        id: 'no-thumb',
        displayName: 'Simple Map',
        fileSizeBytes: 1024,
        gridCols: 10,
        gridRows: 10,
        portalCount: 0,
        addedAt: DateTime.utc(2026, 1, 1),
        // thumbnailPath defaults to null
      );

      final json = original.toJson();
      final restored = MapLibraryEntry.fromJson(json);

      expect(restored.thumbnailPath, isNull);
    });

    test('toJson produces expected keys', () {
      final entry = MapLibraryEntry(
        id: 'test',
        displayName: 'Test',
        fileSizeBytes: 100,
        gridCols: 5,
        gridRows: 5,
        portalCount: 0,
        addedAt: DateTime.utc(2026, 1, 1),
      );

      final json = entry.toJson();

      expect(json.containsKey('id'), true);
      expect(json.containsKey('displayName'), true);
      expect(json.containsKey('fileSizeBytes'), true);
      expect(json.containsKey('gridCols'), true);
      expect(json.containsKey('gridRows'), true);
      expect(json.containsKey('portalCount'), true);
      expect(json.containsKey('addedAt'), true);
      expect(json.containsKey('thumbnailPath'), true);
    });

    test('date serializes as ISO 8601 string', () {
      final entry = MapLibraryEntry(
        id: 'test',
        displayName: 'Test',
        fileSizeBytes: 100,
        gridCols: 5,
        gridRows: 5,
        portalCount: 0,
        addedAt: DateTime.utc(2026, 3, 21, 15, 30, 0),
      );

      final json = entry.toJson();
      expect(json['addedAt'], '2026-03-21T15:30:00.000Z');
    });
  });
}
