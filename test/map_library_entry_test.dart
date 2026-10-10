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

  group('MapLibraryEntry isImage flag (1.1.2+)', () {
    test('isImage defaults to false for new entries', () {
      final entry = MapLibraryEntry(
        id: 'x',
        displayName: 'x',
        fileSizeBytes: 0,
        gridCols: 1,
        gridRows: 1,
        portalCount: 0,
        addedAt: DateTime.utc(2026, 4, 8),
      );
      expect(entry.isImage, isFalse);
      expect(entry.isPdf, isFalse);
    });

    test('image entry round-trips with isImage=true', () {
      final original = MapLibraryEntry(
        id: 'png-001',
        displayName: 'Battle scene.png',
        fileSizeBytes: 3000000,
        gridCols: 20,
        gridRows: 15,
        portalCount: 0,
        addedAt: DateTime.utc(2026, 4, 8),
        isImage: true,
        pdfGridCols: 20,
        pdfGridRows: 15,
      );
      final restored = MapLibraryEntry.fromJson(original.toJson());
      expect(restored.isImage, isTrue);
      expect(restored.isPdf, isFalse);
      expect(restored.pdfGridCols, 20);
      expect(restored.pdfGridRows, 15);
    });

    test('toJson always includes isImage key (forward compat)', () {
      final entry = MapLibraryEntry(
        id: 'x',
        displayName: 'x',
        fileSizeBytes: 0,
        gridCols: 1,
        gridRows: 1,
        portalCount: 0,
        addedAt: DateTime.utc(2026, 4, 8),
      );
      expect(entry.toJson().containsKey('isImage'), isTrue);
    });

    test('legacy JSON without isImage field defaults to false', () {
      final json = {
        'id': 'old',
        'displayName': 'Old',
        'fileSizeBytes': 100,
        'gridCols': 10,
        'gridRows': 10,
        'portalCount': 0,
        'addedAt': '2026-01-01T00:00:00.000Z',
        'isPdf': false,
        // 'isImage' intentionally absent
      };
      final restored = MapLibraryEntry.fromJson(json);
      expect(restored.isImage, isFalse);
    });

    test('legacy buggy entry (image saved with isPdf=true) is preserved verbatim', () {
      // Pre-1.1.2 _downloadAndLoadImage saved PNG/JPG with isPdf=true.
      // Schema-level deserialization keeps that flag as-is; the
      // _resumeSession sniffer is what rescues these entries.
      final json = {
        'id': 'buggy-image',
        'displayName': 'PNG image.png',
        'fileSizeBytes': 3112582,
        'gridCols': 20,
        'gridRows': 15,
        'portalCount': 0,
        'addedAt': '2026-04-08T15:52:51.000Z',
        'isPdf': true, // ← the bug
        // 'isImage' missing
      };
      final restored = MapLibraryEntry.fromJson(json);
      expect(restored.isPdf, isTrue);
      expect(restored.isImage, isFalse);
    });
  });
}
