import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Sends structured log messages to the VPS log server.
/// Used by the TV app to report what it's doing.
class RemoteLog {
  static const String _remoteUrl = 'http://72.62.88.197:4243/';
  static final List<Map<String, dynamic>> _queue = [];
  static bool _flushing = false;
  static String _source = 'tv';

  /// Set the source tag (e.g., 'tv' or 'companion').
  static void setSource(String source) => _source = source;

  /// Send a simple log message.
  static void send(String msg) {
    _queue.add({'src': _source, 'msg': msg});
    if (!_flushing) _flush();
  }

  /// Send a structured event with extra data fields.
  static void sendEvent(String event, Map<String, dynamic> data) {
    final entry = <String, dynamic>{'src': _source, 'event': event};
    entry.addAll(data);
    if (!entry.containsKey('msg')) {
      entry['msg'] = event;
    }
    _queue.add(entry);
    if (!_flushing) _flush();
  }

  /// Send device info (screen size, platform, app version).
  static Future<void> sendDeviceInfo() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final view = WidgetsBindingOrNull.instance?.platformDispatcher.views.first;
      final size = view?.physicalSize;
      final ratio = view?.devicePixelRatio ?? 1.0;
      sendEvent('deviceInfo', {
        'msg': 'Device info',
        'platform': Platform.operatingSystem,
        'osVersion': Platform.operatingSystemVersion,
        'appVersion': info.version,
        'buildNumber': info.buildNumber,
        'screenWidth': size != null ? (size.width / ratio).round() : 0,
        'screenHeight': size != null ? (size.height / ratio).round() : 0,
        'pixelRatio': ratio,
      });
    } catch (e) {
      send('sendDeviceInfo failed: $e');
    }
  }

  static Future<void> _flush() async {
    if (_queue.isEmpty) return;
    _flushing = true;
    final batch = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 3);
      final request = await client.postUrl(Uri.parse(_remoteUrl));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(batch));
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

/// Helper to safely access WidgetsBinding (may be null before runApp).
class WidgetsBindingOrNull {
  static WidgetsBinding? get instance {
    try {
      return WidgetsBinding.instance;
    } catch (_) {
      return null;
    }
  }
}
