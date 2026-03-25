import 'dart:typed_data';

/// Stub for web builds — HTTP download not available.
Future<Uint8List?> httpDownload(
  String url, {
  void Function(double progress)? onProgress,
}) async {
  return null;
}
