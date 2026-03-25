import 'dart:io';
import 'dart:typed_data';

/// Download bytes via HTTP GET (native implementation using dart:io).
/// Reports progress via callback.
Future<Uint8List?> httpDownload(
  String url, {
  void Function(double progress)? onProgress,
}) async {
  try {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 10);
    final request = await client.getUrl(Uri.parse(url));
    final response = await request.close();

    if (response.statusCode != 200) {
      client.close();
      return null;
    }

    final totalBytes = response.contentLength;
    final chunks = <List<int>>[];
    int received = 0;

    await for (final chunk in response) {
      chunks.add(chunk);
      received += chunk.length;
      if (totalBytes > 0) {
        onProgress?.call(received / totalBytes);
      }
    }
    client.close();
    return Uint8List.fromList(chunks.expand((c) => c).toList());
  } catch (e) {
    return null;
  }
}
