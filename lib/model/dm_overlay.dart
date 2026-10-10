/// One DM-only picture layered over the map on the DM's device.
///
/// The DM uploads any number of pictures (a DM version of the map with
/// secret doors and room keys, trap notes, a monster sheet …) and stacks
/// them as layers. **Only the companion renders them** — the TV stores the
/// list with the session so it survives a phone reload, but never downloads
/// or draws the pictures (see [VttGame.dmOverlayImages]).
///
/// The picture file lives on the VPS ([url], uploaded under `/upload/dm/`,
/// exempt from the 7-day upload cleanup); the list in [VttState.dmOverlays]
/// only carries this small metadata. List order is draw order: index 0 is
/// the bottom layer.
///
/// See also:
/// - [VttState.dmOverlays], the session's layer list.
/// - [DmOverlayImages], the phone-side download/decode cache.
/// - [DmOverlayComponent], which draws the visible layers.
class DmOverlay {
  /// Unique id, also the cache key for the decoded picture.
  final String id;

  /// Display name in the Layers tab (the picked file's name).
  final String name;

  /// Absolute HTTP URL of the picture on the VPS, or `local:<id>` in the
  /// companion's local mode (bytes only in memory, never uploaded).
  final String url;

  /// Whether this layer is drawn (the eye toggle).
  final bool visible;

  /// Layer opacity, `0.0`–`1.0`.
  final double opacity;

  /// Default opacity of a newly added layer: readable over the phone's fog
  /// while the map, tokens and fog still show through.
  static const double defaultOpacity = 0.6;

  /// Creates a layer. [opacity] is clamped to `0.0`–`1.0`.
  DmOverlay({
    required this.id,
    required this.name,
    required this.url,
    this.visible = true,
    double opacity = defaultOpacity,
  }) : opacity = opacity.clamp(0.0, 1.0).toDouble();

  /// Returns a copy with the given fields replaced.
  DmOverlay copyWith({String? name, bool? visible, double? opacity}) => DmOverlay(
        id: id,
        name: name ?? this.name,
        url: url,
        visible: visible ?? this.visible,
        opacity: opacity ?? this.opacity,
      );

  /// Serializes this layer for the relay (`vtt.setDmOverlays`,
  /// `vtt.fullState`) and the saved session.
  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'url': url,
        'visible': visible,
        'opacity': opacity,
      };

  /// Parses a layer written by [toJson]. Missing `visible`/`opacity` fall
  /// back to visible at [defaultOpacity].
  factory DmOverlay.fromJson(Map<String, dynamic> json) => DmOverlay(
        id: json['id'] as String,
        name: json['name'] as String? ?? 'Layer',
        url: json['url'] as String,
        visible: json['visible'] as bool? ?? true,
        opacity: (json['opacity'] as num?)?.toDouble() ?? defaultOpacity,
      );

  @override
  bool operator ==(Object other) =>
      other is DmOverlay &&
      other.id == id &&
      other.name == name &&
      other.url == url &&
      other.visible == visible &&
      other.opacity == opacity;

  @override
  int get hashCode => Object.hash(id, name, url, visible, opacity);
}
