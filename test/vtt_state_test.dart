import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/draw_stroke.dart';
import 'package:battlemap/model/map_token.dart';
import 'package:battlemap/state/vtt_state.dart';

/// Create minimal valid UVTT JSON bytes for testing.
/// The image is a tiny 1x1 pixel PNG encoded as base64.
Uint8List _makeMinimalUvttBytes({
  int gridCols = 10,
  int gridRows = 8,
  int pixelsPerGrid = 140,
  List<Map<String, dynamic>>? portals,
}) {
  // Minimal 1x1 red pixel PNG in base64
  const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

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
    'image': tinyPngBase64,
  };

  return Uint8List.fromList(utf8.encode(jsonEncode(json)));
}

void main() {
  group('VttState toJson / applyRemoteState round-trip', () {
    test('serializes and restores all state fields', () {
      final state = VttState();

      // Load a map so we have grid dimensions
      state.loadMap(_makeMinimalUvttBytes(gridCols: 10, gridRows: 8));

      // Modify state
      state.revealedCells = {0, 5, 10, 42};
      state.openPortals = {1, 3};
      state.showGrid = false;
      state.fogEnabled = false;
      state.showWalls = true;
      state.brushRadius = 2;
      state.revealMode = false;
      state.tvWidthInches = 43.0;
      state.calibratedBaseZoom = 2.5;
      state.interactionMode = InteractionMode.draw;
      state.drawColor = const Color(0xFF43A047);
      state.drawWidth = 5.0;
      state.tokens.add(MapToken(
        id: 'tk1',
        label: '1',
        color: const Color(0xFFE53935),
        gridX: 3,
        gridY: 4,
      ));
      state.strokes.add(DrawStroke(
        points: [const Offset(1, 2), const Offset(3, 4)],
        color: const Color(0xFF1E88E5),
        width: 2.0,
      ));

      final json = state.toJson();

      // Create a new state and apply the serialized data
      final restored = VttState();
      restored.applyRemoteState(json);

      expect(restored.revealedCells, {0, 5, 10, 42});
      expect(restored.openPortals, {1, 3});
      expect(restored.showGrid, false);
      expect(restored.fogEnabled, false);
      expect(restored.showWalls, true);
      expect(restored.brushRadius, 2);
      expect(restored.revealMode, false);
      expect(restored.tvWidthInches, 43.0);
      expect(restored.calibratedBaseZoom, 2.5);
      expect(restored.interactionMode, InteractionMode.draw);
      expect(restored.drawColor, const Color(0xFF43A047));
      expect(restored.drawWidth, 5.0);
      expect(restored.tokens.length, 1);
      expect(restored.tokens.first.id, 'tk1');
      expect(restored.tokens.first.gridX, 3);
      expect(restored.strokes.length, 1);
      expect(restored.strokes.first.points.length, 2);
    });

    test('null calibration values survive round-trip', () {
      final state = VttState();
      // defaults: tvWidthInches=null, calibratedBaseZoom=null
      final json = state.toJson();

      final restored = VttState();
      restored.applyRemoteState(json);

      expect(restored.tvWidthInches, isNull);
      expect(restored.calibratedBaseZoom, isNull);
    });

    test('backwards compatible with old state missing new fields', () {
      // Simulate an old-format state message without token/stroke/draw fields
      final oldJson = {
        'revealedCells': <int>[0, 1],
        'openPortals': <int>[],
        'showGrid': true,
        'fogEnabled': true,
        'showWalls': false,
        'brushRadius': 1,
        'revealMode': true,
        'tvWidthInches': null,
        'calibratedBaseZoom': null,
        // No interactionMode, tokens, strokes, drawColor, drawWidth
      };

      final restored = VttState();
      restored.applyRemoteState(oldJson);

      expect(restored.interactionMode, InteractionMode.fogReveal);
      expect(restored.tokens, isEmpty);
      expect(restored.strokes, isEmpty);
      expect(restored.drawColor, const Color(0xFFE53935));
      expect(restored.drawWidth, 3.0);
    });
  });

  group('toggle operations', () {
    test('toggleGrid flips showGrid', () {
      final state = VttState();
      expect(state.showGrid, true);

      state.toggleGrid();
      expect(state.showGrid, false);

      state.toggleGrid();
      expect(state.showGrid, true);
    });

    test('toggleFog flips fogEnabled', () {
      final state = VttState();
      expect(state.fogEnabled, true);

      state.toggleFog();
      expect(state.fogEnabled, false);

      state.toggleFog();
      expect(state.fogEnabled, true);
    });

    test('toggleWalls flips showWalls', () {
      final state = VttState();
      expect(state.showWalls, false);

      state.toggleWalls();
      expect(state.showWalls, true);

      state.toggleWalls();
      expect(state.showWalls, false);
    });

    test('toggleRevealMode flips revealMode', () {
      final state = VttState();
      expect(state.revealMode, true);

      state.toggleRevealMode();
      expect(state.revealMode, false);

      state.toggleRevealMode();
      expect(state.revealMode, true);
    });
  });

  group('toggleReveal', () {
    test('adds cell if not revealed, removes if already revealed', () {
      final state = VttState();

      state.toggleReveal(5);
      expect(state.revealedCells, contains(5));

      state.toggleReveal(5);
      expect(state.revealedCells, isNot(contains(5)));
    });
  });

  group('togglePortal', () {
    test('adds portal if closed, removes if already open', () {
      final state = VttState();

      state.togglePortal(2);
      expect(state.openPortals, contains(2));

      state.togglePortal(2);
      expect(state.openPortals, isNot(contains(2)));
    });
  });

  group('revealAll / hideAll', () {
    test('revealAll reveals all cells', () {
      final state = VttState();

      state.revealAll(80); // 10x8 grid = 80 cells
      expect(state.revealedCells.length, 80);
      expect(state.revealedCells, contains(0));
      expect(state.revealedCells, contains(79));
    });

    test('hideAll clears all revealed cells', () {
      final state = VttState();
      state.revealAll(80);
      expect(state.revealedCells.length, 80);

      state.hideAll();
      expect(state.revealedCells, isEmpty);
    });
  });

  group('applyBrushReveal', () {
    test('reveal mode adds cells', () {
      final state = VttState();
      state.revealMode = true;

      state.applyBrushReveal([0, 1, 2, 3]);
      expect(state.revealedCells, containsAll([0, 1, 2, 3]));
    });

    test('hide mode removes cells', () {
      final state = VttState();
      state.revealedCells = {0, 1, 2, 3, 4, 5};
      state.revealMode = false;

      state.applyBrushReveal([2, 3, 4]);
      expect(state.revealedCells, {0, 1, 5});
    });

    test('reveal mode is idempotent (no duplicate notifications)', () {
      final state = VttState();
      state.revealMode = true;
      state.revealedCells = {0, 1};

      int notifyCount = 0;
      state.addListener(() => notifyCount++);

      // Applying cells that are already revealed should not notify
      state.applyBrushReveal([0, 1]);
      expect(notifyCount, 0);

      // Applying new cells should notify once
      state.applyBrushReveal([2, 3]);
      expect(notifyCount, 1);
    });
  });

  group('setBrushRadius', () {
    test('changes brush radius', () {
      final state = VttState();
      expect(state.brushRadius, 1);

      state.setBrushRadius(2);
      expect(state.brushRadius, 2);

      state.setBrushRadius(0);
      expect(state.brushRadius, 0);
    });
  });

  group('loadMap', () {
    test('loads a valid UVTT map from bytes', () {
      final state = VttState();
      final bytes = _makeMinimalUvttBytes(gridCols: 12, gridRows: 10);

      state.loadMap(bytes);

      expect(state.map, isNotNull);
      expect(state.map!.resolution.mapSize.dx, 12);
      expect(state.map!.resolution.mapSize.dy, 10);
      expect(state.rawMapBytes, bytes);
      expect(state.revealedCells, isEmpty);
    });

    test('portals default state is loaded from file', () {
      final portals = [
        {
          'position': {'x': 1.0, 'y': 2.0},
          'bounds': [
            {'x': 0.5, 'y': 1.5},
            {'x': 1.5, 'y': 2.5},
          ],
          'rotation': 0.0,
          'closed': false, // open by default
          'freestanding': false,
        },
        {
          'position': {'x': 3.0, 'y': 4.0},
          'bounds': [
            {'x': 2.5, 'y': 3.5},
            {'x': 3.5, 'y': 4.5},
          ],
          'rotation': 0.0,
          'closed': true, // closed by default
          'freestanding': false,
        },
      ];

      final state = VttState();
      state.loadMap(_makeMinimalUvttBytes(portals: portals));

      // Portal 0 is not closed, so it should be in openPortals
      expect(state.openPortals, contains(0));
      // Portal 1 is closed, so it should NOT be in openPortals
      expect(state.openPortals, isNot(contains(1)));
    });

    test('notifies listeners when map is loaded', () {
      final state = VttState();
      int notifyCount = 0;
      state.addListener(() => notifyCount++);

      state.loadMap(_makeMinimalUvttBytes());

      expect(notifyCount, 1);
    });
  });

  group('clearMap', () {
    test('resets all map-related state', () {
      final state = VttState();
      state.loadMap(_makeMinimalUvttBytes());
      state.revealedCells.addAll([0, 1, 2]);
      state.openPortals.addAll([0]);
      state.showWalls = true;
      state.fogEnabled = false;

      state.clearMap();

      expect(state.map, isNull);
      expect(state.rawMapBytes, isNull);
      expect(state.revealedCells, isEmpty);
      expect(state.openPortals, isEmpty);
      expect(state.fogEnabled, true);
      expect(state.showWalls, false);
      expect(state.calibratedBaseZoom, isNull);
    });
  });

  group('toJson structure', () {
    test('includes all expected keys', () {
      final state = VttState();
      final json = state.toJson();

      expect(json.containsKey('hasMap'), true);
      expect(json.containsKey('gridCols'), true);
      expect(json.containsKey('gridRows'), true);
      expect(json.containsKey('portalCount'), true);
      expect(json.containsKey('revealedCells'), true);
      expect(json.containsKey('openPortals'), true);
      expect(json.containsKey('showGrid'), true);
      expect(json.containsKey('fogEnabled'), true);
      expect(json.containsKey('showWalls'), true);
      expect(json.containsKey('brushRadius'), true);
      expect(json.containsKey('revealMode'), true);
      expect(json.containsKey('tvWidthInches'), true);
      expect(json.containsKey('calibratedBaseZoom'), true);
      expect(json.containsKey('interactionMode'), true);
      expect(json.containsKey('tokens'), true);
      expect(json.containsKey('strokes'), true);
      expect(json.containsKey('drawColor'), true);
      expect(json.containsKey('drawWidth'), true);
    });

    test('hasMap is false when no map loaded', () {
      final state = VttState();
      expect(state.toJson()['hasMap'], false);
    });

    test('hasMap is true when map is loaded', () {
      final state = VttState();
      state.loadMap(_makeMinimalUvttBytes());
      expect(state.toJson()['hasMap'], true);
    });
  });

  group('token operations', () {
    test('addToken creates token with cycling colors', () {
      final state = VttState();

      state.addToken(2, 3);
      expect(state.tokens.length, 1);
      expect(state.tokens.first.gridX, 2);
      expect(state.tokens.first.gridY, 3);
      expect(state.tokens.first.label, '1');
      expect(state.tokens.first.color, MapToken.tokenColors[0]);

      state.addToken(5, 6);
      expect(state.tokens.length, 2);
      expect(state.tokens.last.color, MapToken.tokenColors[1]);
    });

    test('addToken calls onTokenAdded callback', () {
      final state = VttState();
      MapToken? received;
      state.onTokenAdded = (t) => received = t;

      state.addToken(1, 1);
      expect(received, isNotNull);
      expect(received!.gridX, 1);
    });

    test('moveToken updates position', () {
      final state = VttState();
      state.addToken(0, 0);
      final id = state.tokens.first.id;

      state.moveToken(id, 5, 7);
      expect(state.tokens.first.gridX, 5);
      expect(state.tokens.first.gridY, 7);
    });

    test('moveToken calls onTokenMoved callback', () {
      final state = VttState();
      state.addToken(0, 0);
      final id = state.tokens.first.id;

      String? movedId;
      int? movedX, movedY;
      state.onTokenMoved = (i, x, y) {
        movedId = i;
        movedX = x;
        movedY = y;
      };

      state.moveToken(id, 3, 4);
      expect(movedId, id);
      expect(movedX, 3);
      expect(movedY, 4);
    });

    test('removeToken removes by id', () {
      final state = VttState();
      // Manually add tokens with known unique IDs to avoid timestamp collision
      state.tokens.add(MapToken(
        id: 'token_a',
        label: '1',
        color: MapToken.tokenColors[0],
        gridX: 0,
        gridY: 0,
      ));
      state.tokens.add(MapToken(
        id: 'token_b',
        label: '2',
        color: MapToken.tokenColors[1],
        gridX: 1,
        gridY: 1,
      ));

      state.removeToken('token_a');
      expect(state.tokens.length, 1);
      expect(state.tokens.first.id, 'token_b');
      expect(state.tokens.first.gridX, 1);
    });

    test('removeToken calls onTokenRemoved callback', () {
      final state = VttState();
      state.addToken(0, 0);
      final id = state.tokens.first.id;

      String? removedId;
      state.onTokenRemoved = (i) => removedId = i;

      state.removeToken(id);
      expect(removedId, id);
    });

    test('clearTokens removes all tokens', () {
      final state = VttState();
      state.addToken(0, 0);
      state.addToken(1, 1);
      state.addToken(2, 2);

      state.clearTokens();
      expect(state.tokens, isEmpty);
    });

    test('addToken notifies listeners', () {
      final state = VttState();
      int count = 0;
      state.addListener(() => count++);

      state.addToken(0, 0);
      expect(count, 1);
    });
  });

  group('drawing operations', () {
    test('addStroke adds to list', () {
      final state = VttState();
      final stroke = DrawStroke(
        points: [const Offset(0, 0), const Offset(10, 10)],
        color: const Color(0xFFFF0000),
        width: 2.0,
      );

      state.addStroke(stroke);
      expect(state.strokes.length, 1);
      expect(state.strokes.first.points.length, 2);
    });

    test('addStroke calls onStrokeAdded callback', () {
      final state = VttState();
      DrawStroke? received;
      state.onStrokeAdded = (s) => received = s;

      final stroke = DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFFFF0000),
        width: 1.0,
      );
      state.addStroke(stroke);
      expect(received, isNotNull);
    });

    test('undoStroke removes last stroke', () {
      final state = VttState();
      state.addStroke(DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFFFF0000),
        width: 1.0,
      ));
      state.addStroke(DrawStroke(
        points: [const Offset(5, 5)],
        color: const Color(0xFF00FF00),
        width: 2.0,
      ));

      state.undoStroke();
      expect(state.strokes.length, 1);
      expect(state.strokes.first.color, const Color(0xFFFF0000));
    });

    test('undoStroke on empty list does nothing', () {
      final state = VttState();
      int count = 0;
      state.addListener(() => count++);

      state.undoStroke();
      expect(count, 0); // no notification when nothing to undo
    });

    test('clearDrawings clears all strokes', () {
      final state = VttState();
      state.addStroke(DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFFFF0000),
        width: 1.0,
      ));
      state.addStroke(DrawStroke(
        points: [const Offset(5, 5)],
        color: const Color(0xFF00FF00),
        width: 2.0,
      ));

      state.clearDrawings();
      expect(state.strokes, isEmpty);
    });

    test('clearDrawings calls onDrawingsCleared callback', () {
      final state = VttState();
      bool called = false;
      state.onDrawingsCleared = () => called = true;

      state.clearDrawings();
      expect(called, true);
    });
  });

  group('interaction mode and draw settings', () {
    test('setInteractionMode changes mode', () {
      final state = VttState();
      expect(state.interactionMode, InteractionMode.fogReveal);

      state.setInteractionMode(InteractionMode.draw);
      expect(state.interactionMode, InteractionMode.draw);

      state.setInteractionMode(InteractionMode.token);
      expect(state.interactionMode, InteractionMode.token);
    });

    test('setDrawColor changes color', () {
      final state = VttState();
      state.setDrawColor(const Color(0xFF00FF00));
      expect(state.drawColor, const Color(0xFF00FF00));
    });

    test('setDrawWidth changes width', () {
      final state = VttState();
      state.setDrawWidth(8.0);
      expect(state.drawWidth, 8.0);
    });

    test('setLiveStroke sets and calls callback', () {
      final state = VttState();
      DrawStroke? received;
      state.onLiveStrokeChanged = (s) => received = s;

      final stroke = DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFFFF0000),
        width: 1.0,
      );
      state.setLiveStroke(stroke);
      expect(state.liveStroke, isNotNull);
      expect(received, isNotNull);

      state.setLiveStroke(null);
      expect(state.liveStroke, isNull);
      expect(received, isNull);
    });

    test('liveStroke is NOT included in toJson', () {
      final state = VttState();
      state.setLiveStroke(DrawStroke(
        points: [const Offset(0, 0)],
        color: const Color(0xFFFF0000),
        width: 1.0,
      ));

      final json = state.toJson();
      expect(json.containsKey('liveStroke'), false);
    });
  });
}
