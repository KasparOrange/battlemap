import 'dart:convert';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';

/// Small previews of library maps, for the companion's library list and its
/// "continue" card.
///
/// The TV makes them lazily while it shows the library — one map at a time,
/// never during a game (the box has 2 GB) — stores them with
/// [MapLibrary.saveThumbnail] and sends each to the companion as
/// `lib.thumbnail` (`docs/relay-protocol.md`).
///
/// See also:
/// - [MapLibrary.hasThumbnail], which the library listing reports as
///   `thumbnailAvailable`.
class MapThumbnails {
  MapThumbnails._();

  /// Longest side of a thumbnail in pixels (~50–120 KB as PNG).
  static const int maxSide = 288;

  /// The picture inside a library map file: the file itself for an image
  /// map ([isImage]), else the embedded `image` of the `.dd2vtt` — decoded
  /// in a background isolate, since big maps are tens of MB of JSON.
  ///
  /// Returns `null` if the file has no readable picture.
  static Future<Uint8List?> mapPicture(Uint8List fileBytes,
      {required bool isImage}) async {
    if (isImage) return fileBytes;
    return compute(uvttPicture, fileBytes);
  }

  /// Extracts the base64 `image` of a `.dd2vtt` file, `null` if missing or
  /// the file isn't UVTT JSON. Public for tests; use [mapPicture].
  static Uint8List? uvttPicture(Uint8List fileBytes) {
    try {
      final json = jsonDecode(utf8.decode(fileBytes));
      final image = json is Map<String, dynamic> ? json['image'] : null;
      return image is String ? base64Decode(image) : null;
    } catch (_) {
      return null;
    }
  }

  /// Encodes [picture] (any format the engine decodes) as a PNG whose longest
  /// side is [side] pixels — never upscaled. Reads the size from the header
  /// and decodes straight to the small size, so a 17100×9600 castle never
  /// exists at full size in memory.
  ///
  /// Returns `null` if [picture] can't be decoded.
  static Future<Uint8List?> encode(Uint8List picture, {int side = maxSide}) async {
    ui.ImmutableBuffer? buffer;
    ui.ImageDescriptor? descriptor;
    ui.Codec? codec;
    ui.Image? image;
    try {
      buffer = await ui.ImmutableBuffer.fromUint8List(picture);
      descriptor = await ui.ImageDescriptor.encoded(buffer);
      final scale = min(1.0, side / max(descriptor.width, descriptor.height));
      codec = await descriptor.instantiateCodec(
        targetWidth: max(1, (descriptor.width * scale).round()),
        targetHeight: max(1, (descriptor.height * scale).round()),
      );
      image = (await codec.getNextFrame()).image;
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      return data?.buffer.asUint8List();
    } catch (e) {
      debugPrint('MapThumbnails: encode failed: $e');
      return null;
    } finally {
      image?.dispose();
      codec?.dispose();
      descriptor?.dispose();
      buffer?.dispose();
    }
  }
}
