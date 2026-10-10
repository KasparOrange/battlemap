import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../model/shared_map.dart';
import 'http_upload_stub.dart'
    if (dart.library.html) 'http_upload.dart';
import 'relay_config.dart';

/// HTTP client for the shared map library on the VPS (`/library` on the dev
/// server, `tools/dev_server.py`) — the companion lists, fills and prunes
/// it; the TV only downloads the files ([SharedMap.url]).
///
/// Every call returns `null` / `false` on a network or server error instead
/// of throwing; the caller shows the failure.
///
/// See also:
/// * [SharedMap], one entry.
/// * `docs/relay-protocol.md` "shared map library" for the endpoints.
class SharedLibraryClient {
  /// The dev server's base URL, e.g. `http://72.62.88.197:4242`.
  final String base;

  /// Creates a client for [base] (default: [RelayConfig.httpBase]).
  SharedLibraryClient({String? base}) : base = base ?? RelayConfig.httpBase;

  /// The absolute URL of a server [path] such as [SharedMap.url].
  String absolute(String path) => '$base$path';

  /// The library's maps, newest first, or `null` if the server can't be
  /// reached.
  Future<List<SharedMap>?> list() async {
    final bytes = await httpDownloadWeb(absolute('/library'));
    if (bytes == null) return null;
    try {
      final json = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      return (json['maps'] as List)
          .map((m) => SharedMap.fromJson(Map<String, dynamic>.from(m as Map)))
          .toList();
    } catch (e) {
      debugPrint('SharedLibraryClient.list: bad answer: $e');
      return null;
    }
  }

  /// Uploads a map file ([bytes], original [fileName]) with its [meta]
  /// ([SharedMap.uploadMeta]) and returns the new entry, or `null` when the
  /// upload failed. [onProgress] gets 0..1 (coarse on native builds).
  Future<SharedMap?> upload(String fileName, Uint8List bytes,
      Map<String, dynamic> meta,
      {void Function(double progress)? onProgress}) async {
    final url = absolute('/library/${Uri.encodeComponent(fileName)}'
        '?meta=${Uri.encodeQueryComponent(jsonEncode(meta))}');
    final resp = await httpUpload(url, bytes, onProgress: onProgress);
    if (resp == null) return null;
    try {
      return SharedMap.fromJson(resp);
    } catch (e) {
      debugPrint('SharedLibraryClient.upload: bad answer: $e');
      return null;
    }
  }

  /// Stores the thumbnail [png] of map [id]; returns the updated entry or
  /// `null`.
  Future<SharedMap?> uploadThumbnail(String id, Uint8List png) async {
    final resp = await httpUpload(absolute('/library/$id/thumb'), png);
    return resp == null ? null : SharedMap.fromJson(resp);
  }

  /// Removes map [id] from the library. TVs keep their copies, so games
  /// using it go on. Returns whether the server removed it.
  Future<bool> delete(String id) => httpDelete(absolute('/library/$id'));
}
