import 'package:flutter/foundation.dart';

import '../network/remote_log_stub.dart'
    if (dart.library.io) '../network/remote_log.dart';

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
  /// The message is also forwarded to [debugPrint] for console output and,
  /// unless [remote] is false, to MwLog via [RemoteLog] under tag `devlog`
  /// (warn when it reads like a failure) — the companion's whole log, which
  /// before 2026-10-10 never left the tablet. Pass `remote: false` for lines
  /// that are already in MwLog (the TV's own lines echoed via `tv.log`).
  /// If the buffer exceeds [maxLines], the oldest entries are trimmed.
  static void add(String msg, {bool remote = true}) {
    if (remote) {
      final bad = RegExp(r'error|failed', caseSensitive: false).hasMatch(msg);
      bad ? RemoteLog.warn('devlog', msg) : RemoteLog.info('devlog', msg);
    }
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
