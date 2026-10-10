/// Stub for web builds — remote logging disabled.
///
/// Web builds use the JavaScript console override in `index.html` instead.
/// This stub keeps the same API surface as `remote_log.dart` so call sites
/// can be conditionally imported via `if (dart.library.io)`.
class RemoteLog {
  /// No-op on web; configures the source tag on native.
  static void setSource(String source) {}

  /// No-op on web.
  static void send(String msg) {}

  /// No-op on web.
  static void sendEvent(String event, Map<String, dynamic> data) {}

  /// No-op on web.
  static void debug(String tag, String msg, [Map<String, dynamic>? extra]) {}

  /// No-op on web.
  static void info(String tag, String msg, [Map<String, dynamic>? extra]) {}

  /// No-op on web.
  static void warn(String tag, String msg, [Map<String, dynamic>? extra]) {}

  /// No-op on web.
  static void error(String tag, String msg, [Map<String, dynamic>? extra]) {}

  /// No-op on web.
  static Future<void> sendDeviceInfo() async {}
}
