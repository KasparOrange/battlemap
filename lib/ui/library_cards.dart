import 'dart:typed_data';

import 'package:flutter/material.dart';

/// Default name of a new session: its number on this map and the day it
/// starts, e.g. "Session 3 · Sat 10 Oct" — so the list tells game nights
/// apart without renaming.
///
/// [existing] is how many sessions the map already has.
String defaultSessionName(int existing, DateTime now) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return 'Session ${existing + 1} · '
      '${days[now.weekday - 1]} ${now.day} ${months[now.month - 1]}';
}

/// A map's thumbnail ([bytes], from the TV's `lib.thumbnail`) at
/// [width] × [height], rounded; the map / PDF icon until it has arrived.
class MapThumb extends StatelessWidget {
  /// PNG bytes of the thumbnail, `null` while missing.
  final Uint8List? bytes;

  /// Shows the PDF icon instead of the map icon while [bytes] is missing.
  final bool isPdf;

  /// Box width in logical pixels.
  final double width;

  /// Box height in logical pixels.
  final double height;

  /// Creates a thumbnail box.
  const MapThumb({
    super.key,
    required this.bytes,
    this.isPdf = false,
    this.width = 64,
    this.height = 40,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Container(
        width: width,
        height: height,
        color: Colors.white.withValues(alpha: 0.05),
        child: bytes != null
            ? Image.memory(bytes!, fit: BoxFit.cover, gaplessPlayback: true)
            : Icon(
                isPdf ? Icons.picture_as_pdf : Icons.map,
                color: isPdf
                    ? Colors.redAccent.withValues(alpha: 0.5)
                    : Colors.white24,
                size: height * 0.6,
              ),
      ),
    );
  }
}

/// The library's top card: the most recently played session, one tap to
/// carry on where the table left off.
///
/// See also: [VttCompanionScreen], which picks the session and resumes it.
class ContinueSessionCard extends StatelessWidget {
  /// The session's name.
  final String sessionName;

  /// The map's display name.
  final String mapName;

  /// When it was last played, already worded ("2h ago").
  final String ago;

  /// The map's thumbnail, `null` while missing.
  final Uint8List? thumbnail;

  /// Progress 0..1 while the session loads, `null` when idle.
  final double? progress;

  /// Resumes the session.
  final VoidCallback onTap;

  /// Creates the card.
  const ContinueSessionCard({
    super.key,
    required this.sessionName,
    required this.mapName,
    required this.ago,
    required this.thumbnail,
    required this.onTap,
    this.progress,
  });

  @override
  Widget build(BuildContext context) {
    final loading = progress != null;
    return Material(
      color: Colors.greenAccent.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.greenAccent.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              MapThumb(bytes: thumbnail, width: 112, height: 70),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'CONTINUE',
                      style: TextStyle(
                        color: Colors.greenAccent,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      sessionName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '$mapName  •  $ago',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (loading) ...[
                      const SizedBox(height: 6),
                      LinearProgressIndicator(
                        value: progress,
                        backgroundColor: Colors.white12,
                        color: Colors.greenAccent,
                        minHeight: 3,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                loading ? Icons.downloading : Icons.play_circle_fill,
                color: Colors.greenAccent,
                size: 40,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
