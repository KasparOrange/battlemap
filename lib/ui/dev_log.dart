import 'package:flutter/foundation.dart';

/// Singleton in-memory log buffer for the [DevScreen].
///
/// Captures timestamped messages and notifies registered listeners so
/// the developer screen can update in real time. The buffer is capped
/// at [maxLines] entries; oldest lines are discarded when the cap is
/// exceeded.
///
/// Usage:
/// ```dart
/// DevLog.add('Companion: paired with TV');
/// ```
///
/// See also:
/// - [DevScreen], which renders these log lines on screen.
class DevLog {
  /// All buffered log lines, each prefixed with an `[HH:MM:SS]` timestamp.
  static final List<String> lines = [];

  static final List<VoidCallback> _listeners = [];

  /// Maximum number of log lines retained in [lines].
  ///
  /// When exceeded, the oldest entries are removed to stay within this limit.
  static const int maxLines = 500;

  /// Appends a timestamped log message to [lines] and notifies listeners.
  ///
  /// The message is also forwarded to [debugPrint] for console output.
  /// If the buffer exceeds [maxLines], the oldest entries are trimmed.
  static void add(String msg) {
    final ts = DateTime.now().toString().substring(11, 19);
    lines.add('[$ts] $msg');
    if (lines.length > maxLines) lines.removeRange(0, lines.length - maxLines);
    for (final l in _listeners) {
      l();
    }
    debugPrint(msg);
  }

  /// Registers a callback that fires whenever a new line is added.
  static void addListener(VoidCallback l) => _listeners.add(l);

  /// Removes a previously registered listener callback.
  static void removeListener(VoidCallback l) => _listeners.remove(l);
}
