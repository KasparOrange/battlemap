import 'dart:convert';
import 'dart:typed_data';

import 'uvtt_map.dart';

/// Parser for Universal VTT map files (`.dd2vtt` / `.uvtt`).
///
/// The Universal VTT (UVTT) format is a JSON file containing:
/// - A base64-encoded map image (`"image"`)
/// - Grid resolution metadata (`"resolution"`)
/// - Wall geometry for line-of-sight (`"line_of_sight"`, `"objects_line_of_sight"`)
/// - Interactive portals / doors (`"portals"`)
/// - Light sources (`"lights"`)
/// - Environment settings (`"environment"`)
///
/// Usage:
/// ```dart
/// final map = UvttParser.parse(utf8.decode(fileBytes));
/// ```
///
/// See also:
/// * [UvttMap], the parsed output containing all map data.
/// * [VttState.loadMap], which uses this parser to load map files.
class UvttParser {
  /// Parses a `.dd2vtt` / `.uvtt` JSON string into a [UvttMap].
  ///
  /// The [jsonString] must be valid JSON conforming to the Universal VTT
  /// format. The `"image"` field is decoded from base64 into raw image bytes.
  ///
  /// Missing optional sections (`line_of_sight`, `objects_line_of_sight`,
  /// `portals`, `lights`, `environment`) are treated as empty/default.
  ///
  /// Throws [FormatException] if the JSON is malformed or required fields
  /// are missing.
  static UvttMap parse(String jsonString) {
    final json = jsonDecode(jsonString) as Map<String, dynamic>;

    // Decode base64 image
    final imageBase64 = json['image'] as String;
    final imageBytes = base64Decode(imageBase64);

    return UvttMap(
      format: (json['format'] as num).toDouble(),
      resolution: UvttResolution.fromJson(
          json['resolution'] as Map<String, dynamic>),
      lineOfSight: _parsePolylines(json['line_of_sight']),
      objectsLineOfSight: _parsePolylines(json['objects_line_of_sight']),
      portals: _parsePortals(json['portals']),
      lights: _parseLights(json['lights']),
      environment: UvttEnvironment.fromJson(
          json['environment'] as Map<String, dynamic>? ?? {}),
      imageBytes: Uint8List.fromList(imageBytes),
    );
  }

  /// Parses a list of polylines (wall segments) from JSON.
  ///
  /// Each polyline is a list of [UvttPoint] objects. Returns an empty
  /// list if [data] is `null`.
  static List<List<UvttPoint>> _parsePolylines(dynamic data) {
    if (data == null) return [];
    return (data as List).map((polyline) {
      return (polyline as List)
          .map((p) => UvttPoint.fromJson(p as Map<String, dynamic>))
          .toList();
    }).toList();
  }

  /// Parses the portals array from JSON.
  ///
  /// Returns an empty list if [data] is `null`.
  static List<UvttPortal> _parsePortals(dynamic data) {
    if (data == null) return [];
    return (data as List)
        .map((p) => UvttPortal.fromJson(p as Map<String, dynamic>))
        .toList();
  }

  /// Parses the lights array from JSON.
  ///
  /// Returns an empty list if [data] is `null`.
  static List<UvttLight> _parseLights(dynamic data) {
    if (data == null) return [];
    return (data as List)
        .map((l) => UvttLight.fromJson(l as Map<String, dynamic>))
        .toList();
  }
}
