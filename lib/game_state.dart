import 'package:flutter/material.dart';

/// A token on the battlemap grid.
class MapToken {
  String id;
  String label;
  Color color;
  int gridX;
  int gridY;

  MapToken({
    required this.id,
    required this.label,
    required this.color,
    required this.gridX,
    required this.gridY,
  });
}

/// A single stroke drawn on the map.
class DrawStroke {
  final List<Offset> points;
  final Color color;
  final double width;

  DrawStroke({
    required this.points,
    required this.color,
    required this.width,
  });
}

/// Shared game state — tokens, drawings, grid settings.
class GameState extends ChangeNotifier {
  // Grid config
  static const int gridColumns = 24;
  static const int gridRows = 16;
  static const double cellSize = 50.0;

  double get gridWidth => gridColumns * cellSize;
  double get gridHeight => gridRows * cellSize;

  // Tokens
  final List<MapToken> _tokens = [];
  List<MapToken> get tokens => _tokens;

  // Drawings
  final List<DrawStroke> _strokes = [];
  List<DrawStroke> get strokes => _strokes;

  // Token colors to cycle through
  static const List<Color> tokenColors = [
    Color(0xFFE53935), // red
    Color(0xFF43A047), // green
    Color(0xFF1E88E5), // blue
    Color(0xFFFDD835), // yellow
    Color(0xFF8E24AA), // purple
    Color(0xFFFF8F00), // orange
  ];
  int _nextColorIndex = 0;

  void addToken(int gridX, int gridY) {
    final color = tokenColors[_nextColorIndex % tokenColors.length];
    _nextColorIndex++;
    _tokens.add(MapToken(
      id: 'token_${DateTime.now().millisecondsSinceEpoch}',
      label: '${_tokens.length + 1}',
      color: color,
      gridX: gridX,
      gridY: gridY,
    ));
    notifyListeners();
  }

  void moveToken(String id, int newGridX, int newGridY) {
    final token = _tokens.firstWhere((t) => t.id == id);
    token.gridX = newGridX.clamp(0, gridColumns - 1);
    token.gridY = newGridY.clamp(0, gridRows - 1);
    notifyListeners();
  }

  void removeToken(String id) {
    _tokens.removeWhere((t) => t.id == id);
    notifyListeners();
  }

  void addStroke(DrawStroke stroke) {
    _strokes.add(stroke);
    notifyListeners();
  }

  void clearDrawings() {
    _strokes.clear();
    notifyListeners();
  }
}
