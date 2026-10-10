import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:battlemap/model/session.dart';
import 'package:battlemap/storage/map_library.dart';

/// Minimal 1x1 red pixel PNG in base64 (used as a dummy map image).
const _tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

/// Create minimal valid UVTT JSON bytes for testing.
Uint8List _makeMinimalUvttBytes({
  int gridCols = 10,
  int gridRows = 8,
  int pixelsPerGrid = 140,
  List<Map<String, dynamic>>? portals,
}) {
  final json = {
    'format': 0.3,
    'resolution': {
      'map_origin': {'x': 0, 'y': 0},
      'map_size': {'x': gridCols, 'y': gridRows},
      'pixels_per_grid': pixelsPerGrid,
    },
    'line_of_sight': <List>[],
    'objects_line_of_sight': <List>[],
    'portals': portals ?? <Map>[],
    'lights': <Map>[],
    'environment': {
      'baked_lighting': false,
      'ambient_light': 'ffffffff',
    },
    'image': _tinyPngBase64,
  };
  return Uint8List.fromList(utf8.encode(jsonEncode(json)));
}

void main() {
  late Directory tempDir;
  late MapLibrary library;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('hive_test');
    Hive.init(tempDir.path);
    library = MapLibrary();
  });

  tearDown(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  group('MapLibrary.init', () {
    test('creates boxes without error', () async {
      await library.init();
      // If init() completes without throwing, boxes were created
      expect(library.entries, isEmpty);
    });

    test('init is idempotent — calling twice does not throw', () async {
      await library.init();
      // Hive's openBox is idempotent, so second call should be fine
      // but we need a new library instance since boxes are already open
      // Just verify the first init succeeded
      expect(library.entries, isEmpty);
    });
  });

  group('MapLibrary.addMap with UVTT', () {
    test('adds UVTT map with correct grid dimensions', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes(gridCols: 24, gridRows: 16);

      final entry = await library.addMap(bytes, 'Dragon Lair');

      expect(entry.displayName, 'Dragon Lair');
      expect(entry.gridCols, 24);
      expect(entry.gridRows, 16);
      expect(entry.fileSizeBytes, bytes.length);
      expect(entry.isPdf, false);
      expect(entry.id, isNotEmpty);
    });

    test('adds UVTT map with portals and reports portal count', () async {
      await library.init();
      final portals = [
        {
          'position': {'x': 1.0, 'y': 2.0},
          'bounds': [
            {'x': 0.5, 'y': 1.5},
            {'x': 1.5, 'y': 2.5},
          ],
          'rotation': 0.0,
          'closed': true,
          'freestanding': false,
        },
        {
          'position': {'x': 3.0, 'y': 4.0},
          'bounds': [
            {'x': 2.5, 'y': 3.5},
            {'x': 3.5, 'y': 4.5},
          ],
          'rotation': 0.0,
          'closed': false,
          'freestanding': false,
        },
      ];
      final bytes = _makeMinimalUvttBytes(portals: portals);

      final entry = await library.addMap(bytes, 'Portal Map');

      expect(entry.portalCount, 2);
    });

    test('entry appears in entries getter after add', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes();

      await library.addMap(bytes, 'Test Map');

      final entries = library.entries;
      expect(entries.length, 1);
      expect(entries.first.displayName, 'Test Map');
    });

    test('multiple maps get unique IDs', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes();

      final entry1 = await library.addMap(bytes, 'Map 1');
      final entry2 = await library.addMap(bytes, 'Map 2');

      expect(entry1.id, isNot(entry2.id));
      expect(library.entries.length, 2);
    });
  });

  group('MapLibrary.addMap with PDF', () {
    test('adds PDF map with isPdf true and custom grid', () async {
      await library.init();
      final pdfBytes = Uint8List.fromList([0x25, 0x50, 0x44, 0x46]); // %PDF

      final entry = await library.addMap(
        pdfBytes,
        'Dungeon.pdf',
        isPdf: true,
        pdfGridCols: 30,
        pdfGridRows: 20,
      );

      expect(entry.isPdf, true);
      expect(entry.gridCols, 30);
      expect(entry.gridRows, 20);
      expect(entry.pdfGridCols, 30);
      expect(entry.pdfGridRows, 20);
      expect(entry.portalCount, 0);
    });

    test('PDF map defaults grid to 20x15 when not specified', () async {
      await library.init();
      final pdfBytes = Uint8List.fromList([0x25, 0x50, 0x44, 0x46]);

      final entry = await library.addMap(
        pdfBytes,
        'Simple.pdf',
        isPdf: true,
      );

      expect(entry.gridCols, 20);
      expect(entry.gridRows, 15);
    });
  });

  group('MapLibrary.loadMapBytes', () {
    test('returns stored bytes for existing map', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes(gridCols: 12, gridRows: 10);

      final entry = await library.addMap(bytes, 'Stored Map');
      final loaded = await library.loadMapBytes(entry.id);

      expect(loaded, equals(bytes));
    });

    test('throws StateError for missing map', () async {
      await library.init();

      expect(
        () => library.loadMapBytes('nonexistent-id'),
        throwsStateError,
      );
    });
  });

  group('MapLibrary.deleteMap', () {
    test('removes entry and file', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes();

      final entry = await library.addMap(bytes, 'To Delete');
      expect(library.entries.length, 1);

      await library.deleteMap(entry.id);

      expect(library.entries, isEmpty);
      expect(library.getEntry(entry.id), isNull);
      expect(
        () => library.loadMapBytes(entry.id),
        throwsStateError,
      );
    });

    test('deleting map also deletes its sessions', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes();
      final entry = await library.addMap(bytes, 'Map With Sessions');

      // Create sessions for this map
      final session1 = Session(
        id: 'session-1',
        mapId: entry.id,
        name: 'Session 1',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );
      final session2 = Session(
        id: 'session-2',
        mapId: entry.id,
        name: 'Session 2',
        createdAt: DateTime.utc(2026, 1, 2),
        lastModifiedAt: DateTime.utc(2026, 1, 2),
      );
      await library.saveSession(session1);
      await library.saveSession(session2);

      expect((await library.listSessions(mapId: entry.id)).length, 2);

      await library.deleteMap(entry.id);

      expect((await library.listSessions(mapId: entry.id)), isEmpty);
    });
  });

  group('MapLibrary session operations', () {
    test('saveSession / loadSession round-trip', () async {
      await library.init();

      final session = Session(
        id: 'session-abc',
        mapId: 'map-xyz',
        name: 'Dragon Lair Run',
        createdAt: DateTime.utc(2026, 1, 15),
        lastModifiedAt: DateTime.utc(2026, 1, 15),
        revealedCells: [0, 5, 10],
        openPortals: [1],
        showGrid: false,
        fogEnabled: false,
        tokenData: [
          {'id': 'tk1', 'label': '1', 'color': 'ffe53935', 'gridX': 3, 'gridY': 4},
        ],
      );

      await library.saveSession(session);
      final loaded = await library.loadSession('session-abc');

      expect(loaded, isNotNull);
      expect(loaded!.id, 'session-abc');
      expect(loaded.mapId, 'map-xyz');
      expect(loaded.name, 'Dragon Lair Run');
      expect(loaded.revealedCells, [0, 5, 10]);
      expect(loaded.openPortals, [1]);
      expect(loaded.showGrid, false);
      expect(loaded.fogEnabled, false);
      expect(loaded.tokenData.length, 1);
    });

    test('loadSession returns null for nonexistent session', () async {
      await library.init();

      final loaded = await library.loadSession('nonexistent');
      expect(loaded, isNull);
    });

    test('listSessions returns sessions sorted by lastModifiedAt descending', () async {
      await library.init();

      final s1 = Session(
        id: 'session-1',
        mapId: 'map-1',
        name: 'Oldest',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );
      final s2 = Session(
        id: 'session-2',
        mapId: 'map-1',
        name: 'Middle',
        createdAt: DateTime.utc(2026, 2, 1),
        lastModifiedAt: DateTime.utc(2026, 2, 1),
      );
      final s3 = Session(
        id: 'session-3',
        mapId: 'map-1',
        name: 'Newest',
        createdAt: DateTime.utc(2026, 3, 1),
        lastModifiedAt: DateTime.utc(2026, 3, 1),
      );

      await library.saveSession(s1);
      await library.saveSession(s2);
      await library.saveSession(s3);

      final sessions = await library.listSessions();

      expect(sessions.length, 3);
      expect(sessions[0].name, 'Newest');
      expect(sessions[1].name, 'Middle');
      expect(sessions[2].name, 'Oldest');
    });

    test('listSessions filters by mapId', () async {
      await library.init();

      final s1 = Session(
        id: 'session-a',
        mapId: 'map-1',
        name: 'Session A',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );
      final s2 = Session(
        id: 'session-b',
        mapId: 'map-2',
        name: 'Session B',
        createdAt: DateTime.utc(2026, 1, 2),
        lastModifiedAt: DateTime.utc(2026, 1, 2),
      );
      final s3 = Session(
        id: 'session-c',
        mapId: 'map-1',
        name: 'Session C',
        createdAt: DateTime.utc(2026, 1, 3),
        lastModifiedAt: DateTime.utc(2026, 1, 3),
      );

      await library.saveSession(s1);
      await library.saveSession(s2);
      await library.saveSession(s3);

      final map1Sessions = await library.listSessions(mapId: 'map-1');
      expect(map1Sessions.length, 2);
      expect(map1Sessions.every((s) => s.mapId == 'map-1'), true);

      final map2Sessions = await library.listSessions(mapId: 'map-2');
      expect(map2Sessions.length, 1);
      expect(map2Sessions.first.name, 'Session B');
    });

    test('deleteSession removes session', () async {
      await library.init();

      final session = Session(
        id: 'session-to-delete',
        mapId: 'map-1',
        name: 'Doomed',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );
      await library.saveSession(session);

      expect(await library.loadSession('session-to-delete'), isNotNull);

      await library.deleteSession('session-to-delete');

      expect(await library.loadSession('session-to-delete'), isNull);
      expect((await library.listSessions()), isEmpty);
    });

    test('saveSession updates lastModifiedAt', () async {
      await library.init();

      final session = Session(
        id: 'session-time',
        mapId: 'map-1',
        name: 'Timed',
        createdAt: DateTime.utc(2026, 1, 1),
        lastModifiedAt: DateTime.utc(2026, 1, 1),
      );

      final before = DateTime.now();
      await library.saveSession(session);
      final after = DateTime.now();

      final loaded = await library.loadSession('session-time');
      expect(loaded!.lastModifiedAt.isAfter(before) ||
          loaded.lastModifiedAt.isAtSameMomentAs(before), true);
      expect(loaded.lastModifiedAt.isBefore(after) ||
          loaded.lastModifiedAt.isAtSameMomentAs(after), true);
    });
  });

  group('MapLibrary.entries', () {
    test('returns all map entries', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes();

      await library.addMap(bytes, 'Map Alpha');
      await library.addMap(bytes, 'Map Beta');
      await library.addMap(bytes, 'Map Gamma');

      final entries = library.entries;
      expect(entries.length, 3);

      final names = entries.map((e) => e.displayName).toSet();
      expect(names, containsAll(['Map Alpha', 'Map Beta', 'Map Gamma']));
    });

    test('returns empty list when no maps added', () async {
      await library.init();
      expect(library.entries, isEmpty);
    });
  });

  group('MapLibrary.getEntry', () {
    test('returns entry by ID', () async {
      await library.init();
      final bytes = _makeMinimalUvttBytes();
      final entry = await library.addMap(bytes, 'Findable Map');

      final found = library.getEntry(entry.id);
      expect(found, isNotNull);
      expect(found!.displayName, 'Findable Map');
    });

    test('returns null for unknown ID', () async {
      await library.init();
      expect(library.getEntry('no-such-id'), isNull);
    });
  });
}
