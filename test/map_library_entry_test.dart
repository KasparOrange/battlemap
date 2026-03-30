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
      expect(json.containsKey('isPdf'), true);
      expect(json.containsKey('pdfGridCols'), true);
      expect(json.containsKey('pdfGridRows'), true);
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

    test('PDF entry round-trips with isPdf and grid config', () {
      final original = MapLibraryEntry(
        id: 'pdf-001',
        displayName: 'Dungeon Map.pdf',
        fileSizeBytes: 524288,
        gridCols: 30,
        gridRows: 20,
        portalCount: 0,
        addedAt: DateTime.utc(2026, 3, 27, 10, 0, 0),
        isPdf: true,
        pdfGridCols: 30,
        pdfGridRows: 20,
      );

      final json = original.toJson();
      final restored = MapLibraryEntry.fromJson(json);

      expect(restored.isPdf, true);
      expect(restored.pdfGridCols, 30);
      expect(restored.pdfGridRows, 20);
      expect(restored.portalCount, 0);
      expect(restored.gridCols, 30);
      expect(restored.gridRows, 20);
    });

    test('non-PDF entry defaults isPdf to false with null grid config', () {
      final original = MapLibraryEntry(
        id: 'uvtt-001',
        displayName: 'Cave Map',
        fileSizeBytes: 2048,
        gridCols: 24,
        gridRows: 16,
        portalCount: 3,
        addedAt: DateTime.utc(2026, 3, 27),
      );

      final json = original.toJson();
      final restored = MapLibraryEntry.fromJson(json);

      expect(restored.isPdf, false);
      expect(restored.pdfGridCols, isNull);
      expect(restored.pdfGridRows, isNull);
    });

    test('fromJson backwards compatible with old JSON missing PDF fields', () {
      final oldJson = {
        'id': 'legacy-map',
        'displayName': 'Old Map',
        'fileSizeBytes': 1024,
        'gridCols': 10,
        'gridRows': 10,
        'portalCount': 2,
        'addedAt': '2026-01-01T00:00:00.000Z',
        'thumbnailPath': null,
        'vpsUrl': null,
        // No isPdf, pdfGridCols, pdfGridRows
      };

      final restored = MapLibraryEntry.fromJson(oldJson);

      expect(restored.isPdf, false);
      expect(restored.pdfGridCols, isNull);
      expect(restored.pdfGridRows, isNull);
      expect(restored.gridCols, 10);
      expect(restored.gridRows, 10);
    });
  });
}
