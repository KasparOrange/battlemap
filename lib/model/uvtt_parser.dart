import 'dart:convert';
import 'dart:typed_data';

import 'uvtt_map.dart';

/// Parses .dd2vtt / .uvtt files (Universal VTT format).
class UvttParser {
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

  static List<List<UvttPoint>> _parsePolylines(dynamic data) {
    if (data == null) return [];
    return (data as List).map((polyline) {
      return (polyline as List)
          .map((p) => UvttPoint.fromJson(p as Map<String, dynamic>))
          .toList();
    }).toList();
  }

  static List<UvttPortal> _parsePortals(dynamic data) {
    if (data == null) return [];
    return (data as List)
        .map((p) => UvttPortal.fromJson(p as Map<String, dynamic>))
        .toList();
  }

  static List<UvttLight> _parseLights(dynamic data) {
    if (data == null) return [];
    return (data as List)
        .map((l) => UvttLight.fromJson(l as Map<String, dynamic>))
        .toList();
  }
}
