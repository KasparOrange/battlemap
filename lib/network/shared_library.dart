import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../model/shared_map.dart';
import 'http_upload_stub.dart'
    if (dart.library.html) 'http_upload.dart';
import 'relay_config.dart';

/// What a map is stored as in the shared library — the dev server converts
/// it on upload (`?format=`, `convert_picture` in `tools/dev_server.py`).
///
/// Measured on the test maps (2026-10-10): [webp] is about a fifth smaller
/// than JPEG on painted maps at no visible loss (41–42 dB) and a third of
/// the PNG on line art (stored lossless there), so it is the recommended
/// choice. The pixels never change size, so a picture grid stays valid.
enum StoreFormat {
  /// Kept exactly as it came.
  original('As is', null, 'Stored exactly as it came.'),

  /// WebP: lossy quality 90, or lossless when that is about as small (line
  /// art). Over 16383 px a side it becomes JPEG; a smaller original stays.
  webp('WebP', 'webp',
      'Smallest, looks the same. Line art stays lossless.'),

  /// JPEG quality 90 (transparency goes black).
  jpeg('JPEG', 'jpeg', 'Small and safe everywhere, slightly softer lines.'),

  /// PNG: lossless, the biggest for painted maps.
  png('PNG', 'png', 'Lossless, but big for painted maps.');

  const StoreFormat(this.label, this.query, this.hint);

  /// The chip's label.
  final String label;

  /// The server's `?format=` value, `null` = no conversion.
  final String? query;

  /// One line saying what the choice does.
  final String hint;

  /// The recommended choice (marked in the sheet).
  static const recommended = StoreFormat.webp;

  /// The format named [name] ([Enum.name]), or [original].
  static StoreFormat byName(String? name) =>
      values.where((f) => f.name == name).firstOrNull ?? original;
}

/// What the dev server found behind a link (`GET /fetch`): the downloaded
/// file waits in `uploads/` for the companion to fetch and prepare it like
/// a picked file.
class FetchedLink {
  /// Path of the downloaded file on the dev server (`/uploads/<file>`).
  final String url;

  /// File name with an extension that tells the kind (`Tavern.png`,
  /// `Keep.dd2vtt`, `Inn.pdf`).
  final String name;

  /// File size in bytes.
  final int size;

  /// Creates a result; normally via [SharedLibraryClient.fetchLink].
  const FetchedLink({required this.url, required this.name, this.size = 0});
}

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
  ///
  /// [storeAs] other than [StoreFormat.original] has the server convert the
  /// picture (also the one inside a `.dd2vtt`) first; the entry then
  /// carries [SharedMap.originalSize].
  Future<SharedMap?> upload(String fileName, Uint8List bytes,
      Map<String, dynamic> meta,
      {void Function(double progress)? onProgress,
      StoreFormat storeAs = StoreFormat.original}) async {
    final format = storeAs.query;
    final url = absolute('/library/${Uri.encodeComponent(fileName)}'
        '?meta=${Uri.encodeQueryComponent(jsonEncode(meta))}'
        '${format == null ? '' : '&format=$format'}');
    final resp = await httpUpload(url, bytes, onProgress: onProgress);
    if (resp == null) return null;
    try {
      return SharedMap.fromJson(resp);
    } catch (e) {
      debugPrint('SharedLibraryClient.upload: bad answer: $e');
      return null;
    }
  }

  /// Has the server download what [link] points to (`GET /fetch`): a
  /// picture, PDF or `.dd2vtt`, the main picture of a web page, a Google
  /// Drive or Dropbox share. Returns the result, or throws a
  /// [FormatException] whose message says why not (shown to the DM).
  ///
  /// See also:
  /// * `fetch_link` in `tools/dev_server.py`.
  Future<FetchedLink> fetchLink(String link) async {
    final bytes = await httpDownloadWeb(
        absolute('/fetch?url=${Uri.encodeQueryComponent(link.trim())}'));
    if (bytes == null) {
      throw const FormatException("Can't reach the server — check the connection");
    }
    final json = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    final error = json['error'] as String?;
    if (error != null) throw FormatException(error);
    return FetchedLink(
      url: json['url'] as String,
      name: json['name'] as String,
      size: (json['size'] as num?)?.toInt() ?? 0,
    );
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
