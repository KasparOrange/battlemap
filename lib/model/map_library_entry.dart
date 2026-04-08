/// Metadata for a map stored in the TV's local [MapLibrary].
///
/// Each entry corresponds to a `.dd2vtt` file or a PDF file on disk,
/// identified by a UUID [id] that doubles as the filename stem. The entry
/// tracks grid dimensions, file size, and an optional [thumbnailPath] for
/// the library browser UI.
///
/// For PDF maps, [isPdf] is `true` and [pdfGridCols] / [pdfGridRows]
/// store the user-configured grid dimensions (since PDFs have no embedded
/// grid metadata like UVTT files do).
///
/// Entries are JSON-serializable so the TV can send its library listing
/// to the companion phone over the WebSocket relay.
///
/// See also:
/// * [MapLibrary], which manages the collection of entries on disk.
/// * [Session], which references a map entry by [id].
class MapLibraryEntry {
  /// UUID identifying this map, also used as the filename stem on disk.
  final String id;

  /// Human-readable name shown in the library browser (e.g. "Goblin Cave").
  final String displayName;

  /// Size of the raw `.dd2vtt` file in bytes.
  final int fileSizeBytes;

  /// Number of grid columns in the map.
  final int gridCols;

  /// Number of grid rows in the map.
  final int gridRows;

  /// Number of portals (doors/gates) defined in the map file.
  final int portalCount;

  /// Timestamp when this map was added to the library.
  final DateTime addedAt;

  /// Whether this entry is a PDF map rather than a `.dd2vtt` file.
  ///
  /// PDF maps have no embedded grid metadata, so the grid dimensions are
  /// user-configured via [pdfGridCols] and [pdfGridRows]. PDFs are rendered
  /// to PNG by [PdfHelper.renderPdfPage] before being displayed.
  ///
  /// Mutually exclusive with [isImage]: if both are `false` the entry is a
  /// UVTT map; both should never be `true` at the same time.
  final bool isPdf;

  /// Whether this entry is a raster image (PNG/JPG/WEBP) used as a map.
  ///
  /// Image maps share the user-configured grid fields ([pdfGridCols] /
  /// [pdfGridRows]) with PDFs but do **not** need PDF rendering — the raw
  /// bytes are passed straight to [VttState.loadPdfAsMap].
  ///
  /// Distinguishing image from PDF matters on session resume: a PDF entry
  /// must be re-rendered through [PdfHelper.renderPdfPage], while an image
  /// entry can be loaded directly from disk.
  ///
  /// Mutually exclusive with [isPdf].
  final bool isImage;

  /// User-configured grid columns for PDF or image maps, or `null` for
  /// UVTT maps.
  ///
  /// Only meaningful when [isPdf] or [isImage] is `true`. Defaults to 20
  /// if not specified when adding the entry to the library.
  final int? pdfGridCols;

  /// User-configured grid rows for PDF or image maps, or `null` for UVTT
  /// maps.
  ///
  /// Only meaningful when [isPdf] or [isImage] is `true`. Defaults to 15
  /// if not specified when adding the entry to the library.
  final int? pdfGridRows;

  /// Absolute path to a thumbnail image on disk, or `null` if not yet generated.
  String? thumbnailPath;

  /// URL on the VPS where this map file is hosted for companion download.
  ///
  /// Set when the TV uploads the map to the VPS so the companion phone
  /// can fetch it directly via HTTP rather than chunked WebSocket transfer.
  String? vpsUrl;

  /// Creates a [MapLibraryEntry] with the required metadata fields.
  ///
  /// For PDF maps, set [isPdf] to `true`. For raster image maps, set
  /// [isImage] to `true`. Both types should provide [pdfGridCols] and
  /// [pdfGridRows] with the user-configured grid dimensions. UVTT maps
  /// leave both flags `false`.
  MapLibraryEntry({
    required this.id,
    required this.displayName,
    required this.fileSizeBytes,
    required this.gridCols,
    required this.gridRows,
    required this.portalCount,
    required this.addedAt,
    this.isPdf = false,
    this.isImage = false,
    this.pdfGridCols,
    this.pdfGridRows,
    this.thumbnailPath,
    this.vpsUrl,
  });

  /// Serializes this entry to a JSON-compatible map.
  ///
  /// [addedAt] is encoded as an ISO 8601 string. PDF / image fields
  /// ([isPdf], [isImage], [pdfGridCols], [pdfGridRows]) are always
  /// included for forward compatibility.
  Map<String, dynamic> toJson() => {
        'id': id,
        'displayName': displayName,
        'fileSizeBytes': fileSizeBytes,
        'gridCols': gridCols,
        'gridRows': gridRows,
        'portalCount': portalCount,
        'addedAt': addedAt.toIso8601String(),
        'isPdf': isPdf,
        'isImage': isImage,
        'pdfGridCols': pdfGridCols,
        'pdfGridRows': pdfGridRows,
        'thumbnailPath': thumbnailPath,
        'vpsUrl': vpsUrl,
      };

  /// Deserializes a [MapLibraryEntry] from a JSON map.
  ///
  /// Expects keys matching [toJson] output. The [addedAt] field is parsed
  /// from an ISO 8601 string. The [isPdf], [isImage], and `pdfGrid*`
  /// fields default to `false` / `null` if absent, for backwards
  /// compatibility with entries created before PDF or image support was
  /// added.
  factory MapLibraryEntry.fromJson(Map<String, dynamic> json) =>
      MapLibraryEntry(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        fileSizeBytes: json['fileSizeBytes'] as int,
        gridCols: json['gridCols'] as int,
        gridRows: json['gridRows'] as int,
        portalCount: json['portalCount'] as int,
        addedAt: DateTime.parse(json['addedAt'] as String),
        isPdf: json['isPdf'] as bool? ?? false,
        isImage: json['isImage'] as bool? ?? false,
        pdfGridCols: json['pdfGridCols'] as int?,
        pdfGridRows: json['pdfGridRows'] as int?,
        thumbnailPath: json['thumbnailPath'] as String?,
        vpsUrl: json['vpsUrl'] as String?,
      );
}
