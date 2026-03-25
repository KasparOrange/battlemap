/// Metadata for a map stored in the TV's local [MapLibrary].
///
/// Each entry corresponds to a `.dd2vtt` file on disk, identified by a
/// UUID [id] that doubles as the filename stem. The entry tracks grid
/// dimensions, file size, and an optional [thumbnailPath] for the
/// library browser UI.
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

  /// Absolute path to a thumbnail image on disk, or `null` if not yet generated.
  String? thumbnailPath;

  /// URL on the VPS where this map file is hosted for companion download.
  ///
  /// Set when the TV uploads the map to the VPS so the companion phone
  /// can fetch it directly via HTTP rather than chunked WebSocket transfer.
  String? vpsUrl;

  /// Creates a [MapLibraryEntry] with the required metadata fields.
  MapLibraryEntry({
    required this.id,
    required this.displayName,
    required this.fileSizeBytes,
    required this.gridCols,
    required this.gridRows,
    required this.portalCount,
    required this.addedAt,
    this.thumbnailPath,
    this.vpsUrl,
  });

  /// Serializes this entry to a JSON-compatible map.
  ///
  /// [addedAt] is encoded as an ISO 8601 string.
  Map<String, dynamic> toJson() => {
        'id': id,
        'displayName': displayName,
        'fileSizeBytes': fileSizeBytes,
        'gridCols': gridCols,
        'gridRows': gridRows,
        'portalCount': portalCount,
        'addedAt': addedAt.toIso8601String(),
        'thumbnailPath': thumbnailPath,
        'vpsUrl': vpsUrl,
      };

  /// Deserializes a [MapLibraryEntry] from a JSON map.
  ///
  /// Expects keys matching [toJson] output. The [addedAt] field is
  /// parsed from an ISO 8601 string.
  factory MapLibraryEntry.fromJson(Map<String, dynamic> json) =>
      MapLibraryEntry(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        fileSizeBytes: json['fileSizeBytes'] as int,
        gridCols: json['gridCols'] as int,
        gridRows: json['gridRows'] as int,
        portalCount: json['portalCount'] as int,
        addedAt: DateTime.parse(json['addedAt'] as String),
        thumbnailPath: json['thumbnailPath'] as String?,
        vpsUrl: json['vpsUrl'] as String?,
      );
}
