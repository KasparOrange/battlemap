import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import '../model/uvtt_map.dart';
import '../model/uvtt_parser.dart';

/// DM-controlled runtime state for the VTT table display.
class VttState extends ChangeNotifier {
  UvttMap? map;
  Uint8List? rawMapBytes; // retained for sending to new clients
  bool showGrid = true;
  bool fogEnabled = true;
  bool showWalls = false;
  bool isInteractive = true; // false on TV in networked mode
  Set<int> revealedCells = {};
  Set<int> openPortals = {};

  // Calibration
  double? tvWidthInches;
  double? calibratedBaseZoom;

  // Brush reveal
  int brushRadius = 1; // 0=single, 1=3x3, 2=5x5
  bool revealMode = true; // true=reveal, false=hide

  /// Load a .dd2vtt file from raw bytes.
  void loadMap(Uint8List fileBytes) {
    rawMapBytes = fileBytes;
    final jsonString = utf8.decode(fileBytes);
    map = UvttParser.parse(jsonString);
    // Initialize portal states from file defaults
    openPortals.clear();
    for (int i = 0; i < map!.portals.length; i++) {
      if (!map!.portals[i].closed) openPortals.add(i);
    }
    revealedCells.clear();
    debugPrint('Loaded UVTT map: ${map!.resolution.mapSize.dx.toInt()}x'
        '${map!.resolution.mapSize.dy.toInt()} grid, '
        '${map!.resolution.pixelsPerGrid}ppg, '
        '${map!.portals.length} portals');
    notifyListeners();
  }

  void toggleGrid() {
    showGrid = !showGrid;
    notifyListeners();
  }

  void toggleReveal(int index) {
    if (revealedCells.contains(index)) {
      revealedCells.remove(index);
    } else {
      revealedCells.add(index);
    }
    notifyListeners();
  }

  /// Batch reveal/hide cells (from brush drag).
  void applyBrushReveal(List<int> indices) {
    bool changed = false;
    for (final index in indices) {
      if (revealMode) {
        if (revealedCells.add(index)) changed = true;
      } else {
        if (revealedCells.remove(index)) changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  void revealAll(int totalCells) {
    revealedCells = Set.from(List.generate(totalCells, (i) => i));
    notifyListeners();
  }

  void hideAll() {
    revealedCells.clear();
    notifyListeners();
  }

  void togglePortal(int index) {
    if (openPortals.contains(index)) {
      openPortals.remove(index);
    } else {
      openPortals.add(index);
    }
    notifyListeners();
  }

  void toggleWalls() {
    showWalls = !showWalls;
    notifyListeners();
  }

  void calibrate(double tvWidth, double screenWidthPx) {
    if (map == null) return;
    tvWidthInches = tvWidth;
    final pxPerInch = screenWidthPx / tvWidth;
    calibratedBaseZoom = pxPerInch / map!.resolution.pixelsPerGrid;
    notifyListeners();
  }

  void resetCalibration() {
    tvWidthInches = null;
    calibratedBaseZoom = null;
    notifyListeners();
  }

  void setBrushRadius(int radius) {
    brushRadius = radius;
    notifyListeners();
  }

  void toggleRevealMode() {
    revealMode = !revealMode;
    notifyListeners();
  }

  void toggleFog() {
    fogEnabled = !fogEnabled;
    notifyListeners();
  }

  void clearMap() {
    map = null;
    rawMapBytes = null;
    revealedCells.clear();
    openPortals.clear();
    fogEnabled = true;
    showWalls = false;
    calibratedBaseZoom = null;
    notifyListeners();
  }

  /// Serialize state for broadcast (excludes map bytes).
  Map<String, dynamic> toJson() => {
        'hasMap': map != null,
        'gridCols': map?.resolution.mapSize.dx.toInt(),
        'gridRows': map?.resolution.mapSize.dy.toInt(),
        'portalCount': map?.portals.length ?? 0,
        'revealedCells': revealedCells.toList(),
        'openPortals': openPortals.toList(),
        'showGrid': showGrid,
        'fogEnabled': fogEnabled,
        'showWalls': showWalls,
        'brushRadius': brushRadius,
        'revealMode': revealMode,
        'tvWidthInches': tvWidthInches,
        'calibratedBaseZoom': calibratedBaseZoom,
      };

  /// Apply full state from server broadcast (phone side).
  void applyRemoteState(Map<String, dynamic> json) {
    revealedCells = Set<int>.from(
        (json['revealedCells'] as List).map((e) => e as int));
    openPortals = Set<int>.from(
        (json['openPortals'] as List).map((e) => e as int));
    showGrid = json['showGrid'] as bool;
    fogEnabled = json['fogEnabled'] as bool;
    showWalls = json['showWalls'] as bool;
    brushRadius = json['brushRadius'] as int;
    revealMode = json['revealMode'] as bool;
    tvWidthInches = (json['tvWidthInches'] as num?)?.toDouble();
    calibratedBaseZoom = (json['calibratedBaseZoom'] as num?)?.toDouble();
    notifyListeners(); // single notification
  }
}
