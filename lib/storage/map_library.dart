import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import '../model/map_library_entry.dart';
import '../model/session.dart';
import '../model/uvtt_parser.dart';

/// Persistent storage for maps and sessions using Hive.
/// Works on both Android (APK) and web — no dart:io needed.
class MapLibrary {
  late Box<String> _mapIndexBox;
  late Box<String> _sessionsBox;
  late Box<List<int>> _filesBox;
  late Box<List<int>> _thumbsBox;
  static const _uuid = Uuid();

  List<MapLibraryEntry> get entries => _mapIndexBox.values
      .map((json) => MapLibraryEntry.fromJson(jsonDecode(json) as Map<String, dynamic>))
      .toList();

  Future<void> init() async {
    _mapIndexBox = await Hive.openBox<String>('mapIndex');
    _sessionsBox = await Hive.openBox<String>('sessions');
    _filesBox = await Hive.openBox<List<int>>('mapFiles');
    _thumbsBox = await Hive.openBox<List<int>>('thumbnails');
    debugPrint('MapLibrary: ${_mapIndexBox.length} maps in library');
    // TODO: one-time migration from old dart:io storage (maps/index.json).
    // For now, the TV can re-upload maps. Old files stay on disk but are ignored.
  }

  // --- Map operations ---

  Future<MapLibraryEntry> addMap(Uint8List rawBytes, String displayName) async {
    final id = _uuid.v4();

    // Store raw bytes
    await _filesBox.put(id, rawBytes);

    // Parse to extract metadata
    final jsonString = utf8.decode(rawBytes);
    final map = UvttParser.parse(jsonString);

    final entry = MapLibraryEntry(
      id: id,
      displayName: displayName,
      fileSizeBytes: rawBytes.length,
      gridCols: map.resolution.mapSize.dx.toInt(),
      gridRows: map.resolution.mapSize.dy.toInt(),
      portalCount: map.portals.length,
      addedAt: DateTime.now(),
    );

    // Store entry in index
    await _mapIndexBox.put(id, jsonEncode(entry.toJson()));
    debugPrint('MapLibrary: added "$displayName" ($id)');
    return entry;
  }

  Future<Uint8List> loadMapBytes(String mapId) async {
    final data = _filesBox.get(mapId);
    if (data == null) {
      throw StateError('Map file not found in Hive (mapId=$mapId)');
    }
    return Uint8List.fromList(data);
  }

  Future<void> deleteMap(String mapId) async {
    // Delete map file
    await _filesBox.delete(mapId);

    // Delete thumbnail
    await _thumbsBox.delete('map_$mapId');

    // Delete all sessions for this map
    final sessions = await listSessions(mapId: mapId);
    for (final s in sessions) {
      await deleteSession(s.id);
    }

    // Remove from index
    await _mapIndexBox.delete(mapId);
    debugPrint('MapLibrary: deleted map $mapId');
  }

  MapLibraryEntry? getEntry(String mapId) {
    final json = _mapIndexBox.get(mapId);
    if (json == null) return null;
    try {
      return MapLibraryEntry.fromJson(jsonDecode(json) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  // --- Session operations ---

  Future<List<Session>> listSessions({String? mapId}) async {
    final sessions = <Session>[];
    for (final json in _sessionsBox.values) {
      try {
        final session = Session.fromJson(jsonDecode(json) as Map<String, dynamic>);
        if (mapId == null || session.mapId == mapId) {
          sessions.add(session);
        }
      } catch (e) {
        debugPrint('MapLibrary: failed to parse session: $e');
      }
    }
    sessions.sort((a, b) => b.lastModifiedAt.compareTo(a.lastModifiedAt));
    return sessions;
  }

  Future<Session> saveSession(Session session) async {
    session.lastModifiedAt = DateTime.now();
    await _sessionsBox.put(session.id, jsonEncode(session.toJson()));
    return session;
  }

  Future<Session?> loadSession(String sessionId) async {
    final json = _sessionsBox.get(sessionId);
    if (json == null) return null;
    return Session.fromJson(jsonDecode(json) as Map<String, dynamic>);
  }

  Future<void> deleteSession(String sessionId) async {
    await _sessionsBox.delete(sessionId);
    await _thumbsBox.delete('session_$sessionId');
    debugPrint('MapLibrary: deleted session $sessionId');
  }

  // --- Thumbnail operations ---

  Future<void> saveThumbnail(String id, Uint8List pngBytes,
      {bool isSession = false}) async {
    final key = isSession ? 'session_$id' : 'map_$id';
    await _thumbsBox.put(key, pngBytes);
  }

  bool hasThumbnail(String id, {bool isSession = false}) {
    final key = isSession ? 'session_$id' : 'map_$id';
    return _thumbsBox.containsKey(key);
  }

  Future<Uint8List?> loadThumbnail(String id, {bool isSession = false}) async {
    final key = isSession ? 'session_$id' : 'map_$id';
    final data = _thumbsBox.get(key);
    if (data == null) return null;
    return Uint8List.fromList(data);
  }

  // --- Index management ---

  /// No-op — Hive auto-persists. Kept for API compatibility.
  /// Use [updateEntry] to persist mutations on a single entry.
  Future<void> saveIndex() async {}

  /// Update a single entry in the index (e.g. after setting vpsUrl).
  Future<void> updateEntry(MapLibraryEntry entry) async {
    await _mapIndexBox.put(entry.id, jsonEncode(entry.toJson()));
  }
}
