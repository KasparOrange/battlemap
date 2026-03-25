import 'package:flutter/material.dart';

/// A token placed on the battlemap grid.
///
/// Tokens represent creatures, NPCs, or objects on the map. Each token
/// occupies a single grid cell and is identified by a unique [id], a
/// short [label] (typically a number), and a [color] chosen from
/// [tokenColors].
///
/// Tokens are JSON-serializable for WebSocket relay sync between the
/// companion phone and the TV.
///
/// See also:
/// * [VttState.addToken], which creates and registers a new token.
/// * [VttState.moveToken], which repositions an existing token.
class MapToken {
  /// Unique identifier for this token.
  ///
  /// Generated from a timestamp at creation time
  /// (e.g. `token_1700000000000`).
  String id;

  /// Display label shown on the token circle (e.g. "1", "2").
  String label;

  /// Fill color of the token, drawn as a circle on the grid.
  Color color;

  /// Horizontal grid coordinate (column index, zero-based).
  int gridX;

  /// Vertical grid coordinate (row index, zero-based).
  int gridY;

  /// Creates a [MapToken] at the given grid position.
  MapToken({
    required this.id,
    required this.label,
    required this.color,
    required this.gridX,
    required this.gridY,
  });

  /// Palette of colors to cycle through when creating new tokens.
  ///
  /// Each new token gets the next color in this list (wrapping around).
  static const List<Color> tokenColors = [
    Color(0xFFE53935), // red
    Color(0xFF43A047), // green
    Color(0xFF1E88E5), // blue
    Color(0xFFFDD835), // yellow
    Color(0xFF8E24AA), // purple
    Color(0xFFFF8F00), // orange
  ];

  /// Serializes this token to a JSON-compatible map.
  ///
  /// The [color] is encoded as an 8-character ARGB hex string.
  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'color': color.toARGB32().toRadixString(16).padLeft(8, '0'),
        'gridX': gridX,
        'gridY': gridY,
      };

  /// Deserializes a [MapToken] from a JSON map.
  ///
  /// Expects keys `id`, `label`, `color` (hex string), `gridX`, and `gridY`.
  factory MapToken.fromJson(Map<String, dynamic> json) => MapToken(
        id: json['id'] as String,
        label: json['label'] as String,
        color: Color(int.parse(json['color'] as String, radix: 16)),
        gridX: json['gridX'] as int,
        gridY: json['gridY'] as int,
      );
}
