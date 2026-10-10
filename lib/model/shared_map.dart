/// One map in the shared map library on the VPS (`/library`,
/// `tools/dev_server.py`): kept for every game and every TV, filled from the
/// companion (its "Shared library" sheet, and every map uploaded from the
/// device).
///
/// Paths ([url], [thumbUrl]) are relative to the dev server
/// (`RelayConfig.httpBase`), so the TV and the companion each prefix their
/// own base.
///
/// See also:
/// * [MapLibraryEntry.serverMapId], which links a TV's copy to its entry.
/// * `SharedLibraryClient` (`lib/network/shared_library.dart`), the HTTP
///   client for the library.
class SharedMap {
  /// The server's id for this map (12 hex characters).
  final String id;

  /// The name shown in the library (the file name without extension
  /// unless the DM named it).
  final String name;

  /// `vtt` for a `.dd2vtt`/`.uvtt` file, `image` for a picture (PNG/JPG/
  /// WebP, or a PDF page rasterized on the phone).
  final String kind;

  /// Squares across of a picture map (UVTT maps carry their own grid), or
  /// `null`.
  final int? gridCols;

  /// Squares down of a picture map, or `null`.
  final int? gridRows;

  /// Whether the picture has grid lines of its own (then battlemap draws
  /// none — [MapLibraryEntry.drawGrid]).
  final bool hasOwnGrid;

  /// Where the squares lie on a picture map (`RasterGrid.toJson`), or
  /// `null` = stretched over the whole picture. Passed through untouched.
  final Map<String, dynamic>? grid;

  /// Path of the map file on the dev server (`/uploads/library/<file>`).
  final String url;

  /// Path of the thumbnail PNG, or `null` until the companion sent one.
  final String? thumbUrl;

  /// File size in bytes.
  final int size;

  /// Size of the file as uploaded when the server converted it
  /// (`StoreFormat`), else `null`.
  final int? originalSize;

  /// The server's remark on the conversion ("lossless", "over 16383 px,
  /// stored as JPEG", "not converted: …"), or `null`.
  final String? convertNote;

  /// When the map was added (server time), or `null` if unknown.
  final DateTime? addedAt;

  /// Creates a shared map entry; normally via [SharedMap.fromJson].
  const SharedMap({
    required this.id,
    required this.name,
    required this.kind,
    required this.url,
    this.gridCols,
    this.gridRows,
    this.hasOwnGrid = false,
    this.grid,
    this.thumbUrl,
    this.size = 0,
    this.originalSize,
    this.convertNote,
    this.addedAt,
  });

  /// Whether this is a picture map (needs [gridCols] × [gridRows]).
  bool get isImage => kind == 'image';

  /// The metadata the companion sends with an upload (`?meta=`): name,
  /// kind and the squares chosen in the upload dialog.
  static Map<String, dynamic> uploadMeta({
    required String name,
    required bool isImage,
    int? gridCols,
    int? gridRows,
    bool hasOwnGrid = false,
    Map<String, dynamic>? grid,
  }) =>
      {
        'name': name,
        'kind': isImage ? 'image' : 'vtt',
        if (isImage) 'gridCols': gridCols,
        if (isImage) 'gridRows': gridRows,
        if (isImage) 'hasOwnGrid': hasOwnGrid,
        if (grid != null) 'grid': grid,
      };

  /// Serializes this entry in the server's format (also the `map` field of
  /// the `lib.openSharedMap` relay message).
  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'kind': kind,
        'gridCols': gridCols,
        'gridRows': gridRows,
        'hasOwnGrid': hasOwnGrid,
        if (grid != null) 'grid': grid,
        'url': url,
        'thumbUrl': thumbUrl,
        'size': size,
        if (originalSize != null) 'originalSize': originalSize,
        if (convertNote != null) 'convertNote': convertNote,
        if (addedAt != null) 'addedAt': addedAt!.toIso8601String(),
      };

  /// Parses an entry from the server's `/library` listing.
  ///
  /// Throws a [TypeError] when `id`, `name` or `url` is missing.
  factory SharedMap.fromJson(Map<String, dynamic> json) => SharedMap(
        id: json['id'] as String,
        name: json['name'] as String,
        kind: json['kind'] as String? ?? 'vtt',
        url: json['url'] as String,
        gridCols: (json['gridCols'] as num?)?.toInt(),
        gridRows: (json['gridRows'] as num?)?.toInt(),
        hasOwnGrid: json['hasOwnGrid'] as bool? ?? false,
        grid: json['grid'] is Map
            ? Map<String, dynamic>.from(json['grid'] as Map)
            : null,
        thumbUrl: json['thumbUrl'] as String?,
        size: (json['size'] as num?)?.toInt() ?? 0,
        originalSize: (json['originalSize'] as num?)?.toInt(),
        convertNote: json['convertNote'] as String?,
        addedAt: DateTime.tryParse(json['addedAt'] as String? ?? ''),
      );
}
