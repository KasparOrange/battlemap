import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Severity level for a log entry, ordered from least to most important.
///
/// Used by [RemoteLog] to attach a `level` field to every JSONL entry written
/// to the VPS log server, so consumers can filter or color them. Levels match
/// the conventions used by most logging libraries:
///
/// * [debug] -- noisy detail useful while developing a feature.
/// * [info] -- normal lifecycle events ("session resumed", "map loaded").
/// * [warn] -- something unexpected but recoverable.
/// * [error] -- a failure that should be investigated.
enum LogLevel {
  /// Verbose detail; not enabled in production builds by default.
  debug,

  /// Normal lifecycle events.
  info,

  /// Unexpected but recoverable.
  warn,

  /// Failure that should be investigated.
  error,
}

/// Sends structured log messages to the VPS log server.
///
/// Each entry is a JSON object with at minimum:
///
/// ```json
/// {"src": "tv", "level": "info", "tag": "session", "msg": "Session resumed"}
/// ```
///
/// Entries are batched in [_queue] and flushed asynchronously over HTTPS POST
/// to `_remoteUrl` — MwLog (VictoriaLogs, tenant "battlemap"); query them with
/// `logq.sh` from the my-tube repo or the vmui admin UI.
///
/// Use [debug], [info], [warn], or [error] for tagged level-aware logging.
/// The legacy [send] and [sendEvent] entry points remain for compatibility
/// with older call sites and default to [LogLevel.info] / no tag.
///
/// See also:
/// * [LogLevel] for the level enum.
/// * `docs/setup.md` "logs" for querying and the build-time credential.
class RemoteLog {
  /// MwLog ingest endpoint (VictoriaLogs behind Caddy, tenant "battlemap").
  ///
  /// Entries are posted as JSON lines; `app`/`src` become the stream fields,
  /// `msg` the message, `ts` the event time. See `docs/setup.md` "logs".
  static const String _remoteUrl =
      'https://srv1189697.hstgr.cloud/p/battlemap/insert/jsonline'
      '?_stream_fields=app,src&_msg_field=msg&_time_field=ts';

  /// Basic-auth credentials `user:password`, injected at build time:
  /// `--dart-define=MWLOG_AUTH=battlemap:<password>` (from
  /// `~/.config/mwlog/battlemap.env`). Empty → remote logging is disabled.
  static const String _auth = String.fromEnvironment('MWLOG_AUTH');

  /// Pending entries waiting to be flushed to the server.
  static final List<Map<String, dynamic>> _queue = [];

  /// Whether a [_flush] is currently in progress.
  ///
  /// Prevents two concurrent HTTP POSTs from racing on [_queue].
  static bool _flushing = false;

  /// Source identifier ("tv" or "companion") attached to every entry.
  static String _source = 'tv';

  /// Sets the source tag attached to all subsequent log entries.
  ///
  /// Call once at startup with `'tv'` on the TV shell or `'companion'`
  /// on the phone companion.
  static void setSource(String source) => _source = source;

  // ─── Tagged, level-aware API ───────────────────────────────────────

  /// Logs a [LogLevel.debug] entry under [tag].
  ///
  /// Use for verbose detail while developing a feature. The optional
  /// [extra] map is merged into the JSON entry for queryability.
  static void debug(String tag, String msg, [Map<String, dynamic>? extra]) =>
      _log(LogLevel.debug, tag, msg, extra);

  /// Logs a [LogLevel.info] entry under [tag].
  ///
  /// Use for normal lifecycle events ("session resumed", "map loaded").
  static void info(String tag, String msg, [Map<String, dynamic>? extra]) =>
      _log(LogLevel.info, tag, msg, extra);

  /// Logs a [LogLevel.warn] entry under [tag].
  ///
  /// Use for unexpected but recoverable conditions.
  static void warn(String tag, String msg, [Map<String, dynamic>? extra]) =>
      _log(LogLevel.warn, tag, msg, extra);

  /// Logs a [LogLevel.error] entry under [tag].
  ///
  /// Use for failures that should be investigated. Consider attaching the
  /// caught exception and a short stack excerpt in [extra].
  static void error(String tag, String msg, [Map<String, dynamic>? extra]) =>
      _log(LogLevel.error, tag, msg, extra);

  /// Internal helper that builds the entry map and enqueues a flush.
  static void _log(
    LogLevel level,
    String tag,
    String msg,
    Map<String, dynamic>? extra,
  ) {
    final entry = <String, dynamic>{
      'src': _source,
      'level': level.name,
      'tag': tag,
      'msg': msg,
    };
    if (extra != null) entry.addAll(extra);
    _enqueue(entry);
  }

  /// Stamps the fields every MwLog entry carries and schedules a flush.
  static void _enqueue(Map<String, dynamic> entry) {
    entry['app'] = 'battlemap';
    entry['ts'] = DateTime.now().toUtc().toIso8601String();
    _queue.add(entry);
    if (!_flushing) _flush();
  }

  // ─── Legacy API (kept for compatibility) ───────────────────────────

  /// Legacy entry point: sends an untagged [LogLevel.info] message.
  ///
  /// Prefer [info] (or one of the other level helpers) for new call sites.
  static void send(String msg) {
    _enqueue({
      'src': _source,
      'level': LogLevel.info.name,
      'msg': msg,
    });
  }

  /// Legacy entry point: sends a structured event with extra data fields.
  ///
  /// The [event] becomes both the JSON `event` field and (if [data] does not
  /// already provide one) the `msg` field. Defaults to [LogLevel.info].
  ///
  /// Prefer [info]/[warn]/[error] with an explicit tag for new call sites.
  static void sendEvent(String event, Map<String, dynamic> data) {
    final entry = <String, dynamic>{
      'src': _source,
      'level': LogLevel.info.name,
      'event': event,
    };
    entry.addAll(data);
    if (!entry.containsKey('msg')) entry['msg'] = event;
    _enqueue(entry);
  }

  /// Sends platform/version/screen info as a single `deviceInfo` event.
  ///
  /// Called once at startup so the log stream identifies which device the
  /// subsequent entries came from. Logged at [LogLevel.info] with tag
  /// `device`.
  static Future<void> sendDeviceInfo() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final view = WidgetsBindingOrNull.instance?.platformDispatcher.views.first;
      final size = view?.physicalSize;
      final ratio = view?.devicePixelRatio ?? 1.0;
      RemoteLog.info('device', 'Device info', {
        'event': 'deviceInfo',
        'platform': Platform.operatingSystem,
        'osVersion': Platform.operatingSystemVersion,
        'appVersion': info.version,
        'buildNumber': info.buildNumber,
        'screenWidth': size != null ? (size.width / ratio).round() : 0,
        'screenHeight': size != null ? (size.height / ratio).round() : 0,
        'pixelRatio': ratio,
      });
    } catch (e) {
      RemoteLog.error('device', 'sendDeviceInfo failed', {'error': '$e'});
    }
  }

  /// Drains [_queue] in a single HTTP POST and re-runs if more entries
  /// arrived while flushing.
  ///
  /// Errors are swallowed (and logged to the local console) so that a
  /// broken log server never breaks the app.
  static Future<void> _flush() async {
    if (_queue.isEmpty) return;
    if (_auth.isEmpty) {
      _queue.clear(); // no credential baked into this build → drop silently
      return;
    }
    _flushing = true;
    final batch = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 3);
      final request = await client.postUrl(Uri.parse(_remoteUrl));
      // Explicit JSON content type: VictoriaLogs silently ignores form bodies.
      request.headers.contentType = ContentType.json;
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Basic ${base64Encode(utf8.encode(_auth))}',
      );
      request.write(batch.map(jsonEncode).join('\n'));
      final response = await request.close();
      await response.drain();
      client.close();
    } catch (e) {
      debugPrint('Remote log failed: $e');
    }
    _flushing = false;
    if (_queue.isNotEmpty) _flush();
  }
}

/// Helper to safely access [WidgetsBinding] before [runApp] has been called.
///
/// Returns `null` (instead of throwing) when the binding has not yet been
/// initialized, so [RemoteLog.sendDeviceInfo] can be called from very early
/// app startup paths.
class WidgetsBindingOrNull {
  /// The active [WidgetsBinding], or `null` if it has not been created yet.
  static WidgetsBinding? get instance {
    try {
      return WidgetsBinding.instance;
    } catch (_) {
      return null;
    }
  }
}
