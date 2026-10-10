import 'package:flutter/material.dart';

/// A token placed on the battlemap grid.
///
/// Tokens represent creatures, NPCs, or objects on the map. Each token
/// occupies a single grid cell and is identified by a unique [id], a
/// short [label] (typically a number), and a [color] chosen from
/// [tokenColors].
///
/// Tokens carry optional combat metadata: [name] (display name),
/// [maxHp] / [currentHp] (hit points), and [conditions] (status effects
/// like "poisoned" or "stunned"). These fields default to empty/zero for
/// backwards compatibility with older session data.
///
/// Tokens are JSON-serializable for WebSocket relay sync between the
/// companion phone and the TV.
///
/// See also:
/// * [VttState.addToken], which creates and registers a new token.
/// * [VttState.moveToken], which repositions an existing token.
/// * [VttState.editToken], which updates combat metadata.
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

  /// Display name for this token (e.g. "Goblin Archer").
  ///
  /// Defaults to an empty string when not set. Shown in the token
  /// detail panel and optionally rendered above the token circle.
  String name;

  /// Maximum hit points for this token.
  ///
  /// Defaults to `0` (no HP tracking). When non-zero, enables the HP
  /// bar display on the token.
  int maxHp;

  /// Current hit points for this token.
  ///
  /// Defaults to `0`. Clamped between 0 and [maxHp] by the UI layer.
  int currentHp;

  /// Active status conditions on this token (e.g. "poisoned", "stunned").
  ///
  /// Each entry should be a key from [conditionColors]. Rendered as
  /// colored ring segments or icons around the token circle.
  Set<String> conditions;

  /// Creates a [MapToken] at the given grid position.
  ///
  /// Combat metadata fields ([name], [maxHp], [currentHp], [conditions])
  /// are optional and default to empty/zero for backwards compatibility.
  MapToken({
    required this.id,
    required this.label,
    required this.color,
    required this.gridX,
    required this.gridY,
    this.name = '',
    this.maxHp = 0,
    this.currentHp = 0,
    Set<String>? conditions,
  }) : conditions = conditions ?? {};

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

  /// Maps D&D 5e condition names to ARGB color values for display.
  ///
  /// Used by the token detail panel and the condition ring renderer to
  /// assign a distinct color to each active condition. Keys are lowercase
  /// condition names matching entries in [conditions].
  static const Map<String, int> conditionColors = {
    'poisoned': 0xFF43A047,     // green
    'stunned': 0xFFFDD835,      // yellow
    'frightened': 0xFF9C27B0,   // purple
    'prone': 0xFF795548,        // brown
    'concentrating': 0xFF1E88E5, // blue
    'blinded': 0xFF616161,      // grey
    'charmed': 0xFFE91E63,      // pink
    'restrained': 0xFFFF8F00,   // orange
    'invisible': 0xFFFFFFFF,    // white
    'unconscious': 0xFFE53935,  // red
  };

  /// Serializes this token to a JSON-compatible map.
  ///
  /// The [color] is encoded as an 8-character ARGB hex string. Combat
  /// metadata ([name], [maxHp], [currentHp], [conditions]) is always
  /// included for forward compatibility.
  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'color': color.toARGB32().toRadixString(16).padLeft(8, '0'),
        'gridX': gridX,
        'gridY': gridY,
        'name': name,
        'maxHp': maxHp,
        'currentHp': currentHp,
        'conditions': conditions.toList(),
      };

  /// Deserializes a [MapToken] from a JSON map.
  ///
  /// Expects keys `id`, `label`, `color` (hex string), `gridX`, and `gridY`.
  /// Combat metadata fields (`name`, `maxHp`, `currentHp`, `conditions`) are
  /// optional and fall back to defaults if absent, for backwards compatibility
  /// with older session data.
  factory MapToken.fromJson(Map<String, dynamic> json) => MapToken(
        id: json['id'] as String,
        label: json['label'] as String,
        color: Color(int.parse(json['color'] as String, radix: 16)),
        gridX: json['gridX'] as int,
        gridY: json['gridY'] as int,
        name: json['name'] as String? ?? '',
        maxHp: json['maxHp'] as int? ?? 0,
        currentHp: json['currentHp'] as int? ?? 0,
        conditions: (json['conditions'] as List?)
                ?.map((e) => e as String)
                .toSet() ??
            {},
      );
}
