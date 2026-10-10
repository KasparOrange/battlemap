import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// Hides or shows Android's system bars — the status bar at the top and
/// the navigation bar (back / home / recents) at the bottom.
///
/// Hidden means *sticky immersive* mode: a swipe in from the screen edge
/// brings the bars back for a few seconds, then they hide again; the
/// side-swipe back gesture keeps working. Android re-applies the mode
/// itself when the app comes back from the background.
///
/// Everywhere except Android (web companion, tvOS, desktop) every call is
/// a no-op and [supported] is `false`.
///
/// See also:
/// - [VttCompanionScreen], which hides the bars during a game when the
///   DM's full screen toggle ([loadCompanionFullscreen]) is on.
/// - [TvShell], which hides them for the whole app run.
class SystemBars {
  SystemBars._();

  static const String _boxName = 'companionSettings';
  static const String _fullscreenKey = 'fullscreen';

  /// Whether this platform has system bars this class can hide (Android).
  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Hides both bars (sticky immersive). No-op where not [supported].
  static Future<void> hide() async {
    if (!supported) return;
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  /// Shows both bars again, the app drawn behind them (edge to edge, the
  /// default since Android 15). No-op where not [supported].
  static Future<void> show() async {
    if (!supported) return;
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  }

  /// The companion's full screen toggle, stored on this device; `true`
  /// (bars hidden during a game) when never set or unreadable.
  static Future<bool> loadCompanionFullscreen() async {
    try {
      final box = await Hive.openBox<bool>(_boxName);
      return box.get(_fullscreenKey) ?? true;
    } catch (e) {
      debugPrint('SystemBars.loadCompanionFullscreen failed: $e');
      return true;
    }
  }

  /// Stores the companion's full screen toggle. Errors are logged, never
  /// thrown.
  static Future<void> saveCompanionFullscreen(bool fullscreen) async {
    try {
      final box = await Hive.openBox<bool>(_boxName);
      await box.put(_fullscreenKey, fullscreen);
    } catch (e) {
      debugPrint('SystemBars.saveCompanionFullscreen failed: $e');
    }
  }
}
