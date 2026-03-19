import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import '../model/uvtt_map.dart';
import '../model/uvtt_parser.dart';

/// DM-controlled runtime state for the VTT table display.
class VttState extends ChangeNotifier {
  UvttMap? map;
  bool showGrid = true;
  bool fogEnabled = true;
  Set<int> revealedCells = {};

  /// Load a .dd2vtt file from raw bytes.
  void loadMap(Uint8List fileBytes) {
    final jsonString = utf8.decode(fileBytes);
    map = UvttParser.parse(jsonString);
    debugPrint('Loaded UVTT map: ${map!.resolution.mapSize.dx.toInt()}x'
        '${map!.resolution.mapSize.dy.toInt()} grid, '
        '${map!.resolution.pixelsPerGrid}ppg');
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

  void revealAll(int totalCells) {
    revealedCells = Set.from(List.generate(totalCells, (i) => i));
    notifyListeners();
  }

  void hideAll() {
    revealedCells.clear();
    notifyListeners();
  }

  void toggleFog() {
    fogEnabled = !fogEnabled;
    notifyListeners();
  }

  void clearMap() {
    map = null;
    revealedCells.clear();
    fogEnabled = true;
    notifyListeners();
  }
}
