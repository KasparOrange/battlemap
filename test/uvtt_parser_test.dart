import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/model/uvtt_parser.dart';

/// Minimal 1x1 red pixel PNG in base64 (used as a dummy map image).
const _tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

/// Builds a minimal valid UVTT JSON string for testing.
String _makeUvttJson({
  int gridCols = 10,
  int gridRows = 8,
  int pixelsPerGrid = 140,
  List<Map<String, dynamic>>? portals,
  List<List<Map<String, dynamic>>>? lineOfSight,
  List<Map<String, dynamic>>? lights,
}) {
  final json = {
    'format': 0.3,
    'resolution': {
      'map_origin': {'x': 0, 'y': 0},
      'map_size': {'x': gridCols, 'y': gridRows},
      'pixels_per_grid': pixelsPerGrid,
    },
    'line_of_sight': lineOfSight ?? <List>[],
    'objects_line_of_sight': <List>[],
    'portals': portals ?? <Map>[],
    'lights': lights ?? <Map>[],
    'environment': {
      'baked_lighting': false,
      'ambient_light': 'ffffffff',
    },
    'image': _tinyPngBase64,
  };
  return jsonEncode(json);
}

void main() {
  group('UvttParser.parse', () {
    test('parses valid UVTT JSON with correct resolution', () {
      final jsonStr = _makeUvttJson(
        gridCols: 24,
        gridRows: 16,
        pixelsPerGrid: 140,
      );

      final map = UvttParser.parse(jsonStr);

      expect(map.resolution.mapSize.dx, 24);
      expect(map.resolution.mapSize.dy, 16);
      expect(map.resolution.pixelsPerGrid, 140);
      expect(map.format, 0.3);
    });

    test('grid dimensions extracted correctly', () {
      final jsonStr = _makeUvttJson(gridCols: 30, gridRows: 20);
      final map = UvttParser.parse(jsonStr);

      expect(map.resolution.mapSize.dx.toInt(), 30);
      expect(map.resolution.mapSize.dy.toInt(), 20);
    });

    test('map origin extracted correctly', () {
      final json = {
        'format': 0.3,
        'resolution': {
          'map_origin': {'x': 2, 'y': 3},
          'map_size': {'x': 10, 'y': 8},
          'pixels_per_grid': 100,
        },
        'line_of_sight': <List>[],
        'objects_line_of_sight': <List>[],
        'portals': <Map>[],
        'lights': <Map>[],
        'environment': {
          'baked_lighting': false,
          'ambient_light': 'ffffffff',
        },
        'image': _tinyPngBase64,
      };
      final map = UvttParser.parse(jsonEncode(json));

      expect(map.resolution.mapOrigin.dx, 2);
      expect(map.resolution.mapOrigin.dy, 3);
    });

    test('portal count matches input', () {
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
          'rotation': 1.57,
          'closed': false,
          'freestanding': true,
        },
      ];
      final jsonStr = _makeUvttJson(portals: portals);
      final map = UvttParser.parse(jsonStr);

      expect(map.portals.length, 2);
      expect(map.portals[0].closed, true);
      expect(map.portals[0].freestanding, false);
      expect(map.portals[1].closed, false);
      expect(map.portals[1].freestanding, true);
    });

    test('portal bounds parsed correctly', () {
      final portals = [
        {
          'position': {'x': 5.0, 'y': 5.0},
          'bounds': [
            {'x': 4.5, 'y': 5.0},
            {'x': 5.5, 'y': 5.0},
          ],
          'rotation': 0.0,
          'closed': true,
          'freestanding': false,
        },
      ];
      final jsonStr = _makeUvttJson(portals: portals);
      final map = UvttParser.parse(jsonStr);

      expect(map.portals.first.bounds.length, 2);
      expect(map.portals.first.bounds[0].x, 4.5);
      expect(map.portals.first.bounds[0].y, 5.0);
      expect(map.portals.first.bounds[1].x, 5.5);
      expect(map.portals.first.bounds[1].y, 5.0);
      expect(map.portals.first.position.x, 5.0);
      expect(map.portals.first.position.y, 5.0);
    });

    test('image bytes extracted from base64', () {
      final jsonStr = _makeUvttJson();
      final map = UvttParser.parse(jsonStr);

      expect(map.imageBytes, isNotEmpty);
      // PNG files start with the magic bytes 0x89 0x50 0x4E 0x47
      expect(map.imageBytes[0], 0x89); // PNG signature
      expect(map.imageBytes[1], 0x50); // 'P'
      expect(map.imageBytes[2], 0x4E); // 'N'
      expect(map.imageBytes[3], 0x47); // 'G'
    });

    test('line of sight walls parsed correctly', () {
      final walls = [
        [
          {'x': 0.0, 'y': 0.0},
          {'x': 5.0, 'y': 0.0},
        ],
        [
          {'x': 0.0, 'y': 0.0},
          {'x': 0.0, 'y': 5.0},
        ],
      ];
      final jsonStr = _makeUvttJson(lineOfSight: walls);
      final map = UvttParser.parse(jsonStr);

      expect(map.lineOfSight.length, 2);
      expect(map.lineOfSight[0].length, 2);
      expect(map.lineOfSight[0][0].x, 0.0);
      expect(map.lineOfSight[0][0].y, 0.0);
      expect(map.lineOfSight[0][1].x, 5.0);
      expect(map.lineOfSight[0][1].y, 0.0);
    });

    test('lights parsed correctly', () {
      final lights = [
        {
          'position': {'x': 3.0, 'y': 4.0},
          'range': 20.0,
          'intensity': 0.8,
          'color': 'ffffaa00',
          'shadows': true,
        },
      ];
      final jsonStr = _makeUvttJson(lights: lights);
      final map = UvttParser.parse(jsonStr);

      expect(map.lights.length, 1);
      expect(map.lights.first.position.x, 3.0);
      expect(map.lights.first.position.y, 4.0);
      expect(map.lights.first.range, 20.0);
      expect(map.lights.first.intensity, 0.8);
      expect(map.lights.first.shadows, true);
    });

    test('missing optional sections treated as empty', () {
      // Build JSON with missing optional fields
      final json = {
        'format': 0.3,
        'resolution': {
          'map_origin': {'x': 0, 'y': 0},
          'map_size': {'x': 5, 'y': 5},
          'pixels_per_grid': 100,
        },
        'image': _tinyPngBase64,
        // No line_of_sight, objects_line_of_sight, portals, lights
      };
      final map = UvttParser.parse(jsonEncode(json));

      expect(map.lineOfSight, isEmpty);
      expect(map.objectsLineOfSight, isEmpty);
      expect(map.portals, isEmpty);
      expect(map.lights, isEmpty);
    });

    test('pixelWidth and pixelHeight computed correctly', () {
      final jsonStr = _makeUvttJson(
        gridCols: 20,
        gridRows: 15,
        pixelsPerGrid: 140,
      );
      final map = UvttParser.parse(jsonStr);

      expect(map.pixelWidth, 20 * 140.0);
      expect(map.pixelHeight, 15 * 140.0);
    });
  });

  group('UvttParser error handling', () {
    test('invalid JSON throws FormatException', () {
      expect(
        () => UvttParser.parse('not valid json at all'),
        throwsFormatException,
      );
    });

    test('empty string throws FormatException', () {
      expect(
        () => UvttParser.parse(''),
        throwsFormatException,
      );
    });

    test('valid JSON without required fields throws', () {
      expect(
        () => UvttParser.parse('{"foo": "bar"}'),
        throwsA(isA<Error>().having(
          (e) => e.toString(),
          'message',
          contains(''),
        )),
      );
    });
  });
}
