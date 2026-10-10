import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../model/table_fit.dart';

/// The TV's own calibration on its disk: the physical width of its picture
/// in inches ([VttState.tvWidthInches]).
///
/// It belongs to the TV (the screen does not change with the map or the
/// game), so it lives in its own Hive box instead of in each session; every
/// game then shows its map at one inch per square without calibrating
/// again. Before 1.1.9 each session carried its own `tvWidthInches`.
///
/// See also:
/// - [TableGrid], which turns the width into whole one-inch squares.
/// - `vtt.calibrate` (`docs/relay-protocol.md`), which sets it.
class TvCalibrationStore {
  TvCalibrationStore._();

  static const String _boxName = 'tvSettings';
  static const String _widthKey = 'screenWidthInches';

  static Box<double>? _box;

  static Future<Box<double>> _open() async =>
      _box ??= await Hive.openBox<double>(_boxName);

  /// The stored picture width in inches, or
  /// [TableGrid.defaultScreenWidthInches] when the TV was never calibrated
  /// (or the box cannot be read — the default still gives a usable table).
  static Future<double> loadWidthInches() async {
    try {
      final box = await _open();
      return box.get(_widthKey) ?? TableGrid.defaultScreenWidthInches;
    } catch (e) {
      debugPrint('TvCalibrationStore.load failed: $e');
      return TableGrid.defaultScreenWidthInches;
    }
  }

  /// Stores the picture width; `null` removes it (back to the default).
  /// Errors are logged, never thrown.
  static Future<void> saveWidthInches(double? inches) async {
    try {
      final box = await _open();
      if (inches == null) {
        await box.delete(_widthKey);
      } else {
        await box.put(_widthKey, inches);
      }
    } catch (e) {
      debugPrint('TvCalibrationStore.save failed: $e');
    }
  }
}
