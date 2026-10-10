import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'http_download.dart';

/// Downloads bytes via HTTP GET — the native (Android/iOS/desktop) side of
/// the web build's `httpDownloadWeb`.
///
/// Delegates to [httpDownload] (dart:io) and reports progress through
/// [onProgress]. Returns `null` on any HTTP or network error. Until
/// 2026-10-10 this returned `null` unconditionally, so a native companion
/// (Android tablet) could never load the TV's map.
Future<Uint8List?> httpDownloadWeb(String url, {
  void Function(double progress)? onProgress,
}) => httpDownload(url, onProgress: onProgress);

/// Upload bytes via HTTP PUT (native implementation using dart:io).
Future<Map<String, dynamic>?> httpUpload(
  String url,
  Uint8List bytes, {
  void Function(double progress)? onProgress,
}) async {
  try {
    final client = HttpClient();
    final request = await client.putUrl(Uri.parse(url));
    request.headers.contentType = ContentType.binary;
    request.contentLength = bytes.length;
    request.add(bytes);
    onProgress?.call(0.5); // No granular progress with dart:io
    final response = await request.close();
    if (response.statusCode == 200) {
      final body = await response.transform(utf8.decoder).join();
      onProgress?.call(1.0);
      client.close();
      return jsonDecode(body) as Map<String, dynamic>;
    }
    client.close();
  } catch (e) {
    debugPrint('httpUpload (native): $url failed: $e');
  }
  return null;
}
