import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

/// Download bytes via HTTP GET (web implementation).
Future<Uint8List?> httpDownloadWeb(String url, {
  void Function(double progress)? onProgress,
}) async {
  try {
    final completer = Completer<Uint8List?>();
    final xhr = web.XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';

    xhr.addEventListener('progress', (web.Event event) {
      final e = event as web.ProgressEvent;
      if (e.lengthComputable && onProgress != null) {
        onProgress(e.loaded / e.total);
      }
    }.toJS);

    xhr.addEventListener('load', (web.Event _) {
      if (xhr.status >= 200 && xhr.status < 300) {
        final buffer = xhr.response as JSArrayBuffer;
        completer.complete(buffer.toDart.asUint8List());
      } else {
        completer.complete(null);
      }
    }.toJS);

    xhr.addEventListener('error', ((web.Event _) {
      completer.complete(null);
    }).toJS);

    xhr.timeout = 300000;
    xhr.send();
    return await completer.future;
  } catch (e) {
    return null;
  }
}

/// Upload bytes via HTTP PUT (web implementation using XMLHttpRequest).
Future<Map<String, dynamic>?> httpUpload(
  String url,
  Uint8List bytes, {
  void Function(double progress)? onProgress,
}) async {
  try {
    final completer = Completer<Map<String, dynamic>?>();
    final xhr = web.XMLHttpRequest();

    xhr.open('PUT', url);

    // Track upload progress
    xhr.upload.addEventListener(
      'progress',
      (web.Event event) {
        final e = event as web.ProgressEvent;
        if (e.lengthComputable && onProgress != null) {
          onProgress(e.loaded / e.total);
        }
      }.toJS,
    );

    xhr.addEventListener(
      'load',
      (web.Event _) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            final body = xhr.responseText;
            completer.complete(jsonDecode(body) as Map<String, dynamic>);
          } catch (e) {
            completer.complete(null);
          }
        } else {
          completer.complete(null);
        }
      }.toJS,
    );

    xhr.addEventListener(
      'error',
      ((web.Event _) {
        completer.complete(null);
      }).toJS,
    );

    xhr.addEventListener(
      'timeout',
      ((web.Event _) {
        completer.complete(null);
      }).toJS,
    );

    // 5 minute timeout for large files
    xhr.timeout = 300000;

    // Send as raw bytes
    xhr.send(bytes.toJS);

    return await completer.future;
  } catch (e) {
    return null;
  }
}
