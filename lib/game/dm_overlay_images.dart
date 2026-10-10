import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';

import '../model/dm_overlay.dart';

/// Load state of one DM layer's picture on this device.
enum DmOverlayImageStatus {
  /// Not needed right now (layer hidden) or not requested yet.
  idle,

  /// Downloading or decoding.
  loading,

  /// Decoded and drawn.
  ready,

  /// Download or decode failed. Hiding and showing the layer retries.
  failed,
}

/// Phone-side cache of the DM layer pictures ([DmOverlay]) — downloads,
/// decodes and frees them as the layer list changes.
///
/// Only the companion creates one; a [VttGame] without it (the TV) has no
/// way to show DM layers. The compressed file bytes of every listed layer
/// stay in memory (no second download when a layer is shown again); a
/// decoded [ui.Image] exists only while its layer is visible, because each
/// can be up to [maxSide]² × 4 bytes (64 MB).
///
/// Call [sync] after every change of [VttState.dmOverlays] or
/// [VttState.showDmOverlays]; listeners hear about finished loads (for the
/// Layers tab's status line).
///
/// See also:
/// - [DmOverlayComponent], which draws [imageFor] each frame.
class DmOverlayImages extends ChangeNotifier {
  /// Fetches a layer picture from its [DmOverlay.url]; `null` on failure.
  final Future<Uint8List?> Function(String url) download;

  /// Longest side a layer picture is decoded to — same cap as the map
  /// ([VttGame.maxMapTextureSide]), so a DM version of the map is as sharp
  /// as the map itself.
  static const int maxSide = 4096;

  final Map<String, Uint8List> _bytes = {};
  final Map<String, ui.Image> _images = {};
  final Set<String> _loading = {};
  final Set<String> _failed = {};

  /// Ids of all layers in the current list.
  Set<String> _listed = {};

  /// Ids whose picture should be decoded right now (listed and visible).
  Set<String> _wanted = {};

  bool _disposed = false;

  /// Creates an empty cache that loads pictures through [download].
  DmOverlayImages({required this.download});

  /// Seeds the file bytes of layer [id] — used right after the DM picked
  /// the picture, so it shows without downloading what was just uploaded.
  void put(String id, Uint8List bytes) {
    _bytes[id] = bytes;
    _failed.remove(id);
  }

  /// The decoded picture of layer [id], or `null` while it is hidden,
  /// loading or failed.
  ui.Image? imageFor(String id) => _images[id];

  /// The load state of layer [id] on this device.
  DmOverlayImageStatus statusOf(String id) {
    if (_images.containsKey(id)) return DmOverlayImageStatus.ready;
    if (_loading.contains(id)) return DmOverlayImageStatus.loading;
    if (_failed.contains(id)) return DmOverlayImageStatus.failed;
    return DmOverlayImageStatus.idle;
  }

  /// Brings the cache in line with [overlays]: forgets removed layers,
  /// frees the pictures of hidden ones, and starts loading visible ones.
  ///
  /// With [enabled] `false` (the master switch is off) every decoded
  /// picture is freed, the bytes are kept.
  void sync(List<DmOverlay> overlays, {required bool enabled}) {
    if (_disposed) return;
    _listed = {for (final o in overlays) o.id};
    _wanted = enabled ? {for (final o in overlays) if (o.visible) o.id} : {};
    _bytes.removeWhere((id, _) => !_listed.contains(id));
    // A failed layer retries the next time it is shown.
    _failed.removeWhere((id) => !_wanted.contains(id));
    final unwanted = _images.keys.where((id) => !_wanted.contains(id)).toList();
    for (final id in unwanted) {
      _images.remove(id)!.dispose();
    }
    for (final o in overlays) {
      if (_wanted.contains(o.id) &&
          !_images.containsKey(o.id) &&
          !_loading.contains(o.id) &&
          !_failed.contains(o.id)) {
        _load(o);
      }
    }
  }

  Future<void> _load(DmOverlay overlay) async {
    final id = overlay.id;
    _loading.add(id);
    notifyListeners();
    try {
      var bytes = _bytes[id];
      if (bytes == null) {
        if (overlay.url.startsWith('local:')) {
          throw StateError('local layer picture is no longer in memory');
        }
        bytes = await download(overlay.url);
        if (bytes == null) throw StateError('download failed: ${overlay.url}');
        if (_disposed || !_listed.contains(id)) return;
        _bytes[id] = bytes;
      }
      final image = await decode(bytes);
      if (_disposed || !_wanted.contains(id) || _images.containsKey(id)) {
        image.dispose(); // hidden or removed while decoding
        return;
      }
      _images[id] = image;
    } catch (e) {
      debugPrint('DmOverlayImages: layer $id failed: $e');
      if (!_disposed && _wanted.contains(id)) _failed.add(id);
    } finally {
      _loading.remove(id);
      if (!_disposed) notifyListeners();
    }
  }

  /// Decodes [bytes] (PNG/JPG/WebP) shrunk so the longest side is at most
  /// [maxSide] (never upscaled).
  ///
  /// Throws if the bytes are not a decodable picture.
  static Future<ui.Image> decode(Uint8List bytes) async {
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    final codec = await ui.instantiateImageCodecWithSize(buffer,
        getTargetSize: (w, h) {
      final longest = max(w, h);
      if (longest <= maxSide) return const ui.TargetImageSize();
      final s = maxSide / longest;
      return ui.TargetImageSize(width: (w * s).round(), height: (h * s).round());
    });
    try {
      return (await codec.getNextFrame()).image;
    } finally {
      codec.dispose();
    }
  }

  /// Frees every decoded picture; the cache is unusable afterwards.
  @override
  void dispose() {
    _disposed = true;
    for (final image in _images.values) {
      image.dispose();
    }
    _images.clear();
    _bytes.clear();
    super.dispose();
  }
}
