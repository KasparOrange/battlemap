import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
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

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'color': color.toARGB32().toRadixString(16).padLeft(8, '0'),
        'gridX': gridX,
        'gridY': gridY,
      };

  factory MapToken.fromJson(Map<String, dynamic> json) => MapToken(
        id: json['id'] as String,
        label: json['label'] as String,
        color: Color(int.parse(json['color'] as String, radix: 16)),
        gridX: json['gridX'] as int,
        gridY: json['gridY'] as int,
      );
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

  Map<String, dynamic> toJson() => {
        'points': points.map((p) => [p.dx, p.dy]).toList(),
        'color': color.toARGB32().toRadixString(16).padLeft(8, '0'),
        'width': width,
      };

  factory DrawStroke.fromJson(Map<String, dynamic> json) => DrawStroke(
        points: (json['points'] as List)
            .map((p) => Offset((p[0] as num).toDouble(), (p[1] as num).toDouble()))
            .toList(),
        color: Color(int.parse(json['color'] as String, radix: 16)),
        width: (json['width'] as num).toDouble(),
      );
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

  // PDF background map
  Uint8List? _pdfBytes;
  int _pdfPageIndex = 0;
  int _pdfPageCount = 0;
  ui.Image? _backgroundImage;

  Uint8List? get pdfBytes => _pdfBytes;
  int get pdfPageIndex => _pdfPageIndex;
  int get pdfPageCount => _pdfPageCount;
  ui.Image? get backgroundImage => _backgroundImage;
  bool get hasPdf => _pdfBytes != null;

  /// Set the rendered background image (called by PdfHelper).
  void setPdfState({
    required Uint8List bytes,
    required int pageCount,
    required int pageIndex,
    required ui.Image image,
  }) {
    _backgroundImage?.dispose();
    _pdfBytes = bytes;
    _pdfPageCount = pageCount;
    _pdfPageIndex = pageIndex;
    _backgroundImage = image;
    notifyListeners();
  }

  /// Clear the PDF background.
  void clearPdf() {
    _backgroundImage?.dispose();
    _backgroundImage = null;
    _pdfBytes = null;
    _pdfPageCount = 0;
    _pdfPageIndex = 0;
    notifyListeners();
  }

  // Live stroke from a remote companion (for real-time preview on TV)
  DrawStroke? _liveStroke;
  DrawStroke? get liveStroke => _liveStroke;
  set liveStroke(DrawStroke? stroke) {
    _liveStroke = stroke;
    notifyListeners();
  }

  Map<String, dynamic> toJson() => {
        'tokens': _tokens.map((t) => t.toJson()).toList(),
        'strokes': _strokes.map((s) => s.toJson()).toList(),
        'nextColorIndex': _nextColorIndex,
      };

  void applyFullState(Map<String, dynamic> json) {
    _tokens.clear();
    for (final t in json['tokens'] as List) {
      _tokens.add(MapToken.fromJson(t as Map<String, dynamic>));
    }
    _strokes.clear();
    for (final s in json['strokes'] as List) {
      _strokes.add(DrawStroke.fromJson(s as Map<String, dynamic>));
    }
    _nextColorIndex = json['nextColorIndex'] as int;
    notifyListeners();
  }

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
