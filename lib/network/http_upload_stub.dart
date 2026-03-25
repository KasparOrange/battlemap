import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// Download bytes via HTTP GET (native implementation).
Future<Uint8List?> httpDownloadWeb(String url, {
  void Function(double progress)? onProgress,
}) async {
  // Native uses httpDownload from http_download.dart instead
  return null;
}

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
    // ignore, caller handles null
  }
  return null;
}
