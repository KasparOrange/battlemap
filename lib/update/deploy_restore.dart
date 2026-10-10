import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// What a relaunch after a rolling deploy should reopen — parsed from the
/// app's initial route (see [DeployRestore.parseRoute]).
///
/// See also:
/// - [DeployRestore], which writes the snapshot and reads it back.
/// - `tools/deploy.sh`, which installs a build and relaunches with the route.
class RestoreTarget {
  /// `true` for the TV ([TvShell]), `false` for the companion
  /// ([VttCompanionScreen], networked).
  final bool tv;

  /// Session to resume (TV); `null` = take it from the saved snapshot.
  final String? sessionId;

  /// Map of [sessionId] (informational; the session knows its map).
  final String? mapId;

  /// Creates a target. See the fields.
  const RestoreTarget({required this.tv, this.sessionId, this.mapId});
}

/// The TV's last place (view + map + session), saved so a rolling deploy
/// reopens the running game — battlemap's version of mytube's "deploy
/// restore".
///
/// How a rolling deploy works (`tools/deploy.sh tv`):
/// 1. the new APK is built while the old app keeps running;
/// 2. `deploy.prepare` over the relay: the TV saves the session now, writes
///    this snapshot, shows "Updating…" and answers `deploy.ready`;
/// 3. `install -r` (data kept) kills the old app, the script relaunches it
///    with the initial route `/restore` (or `/restore?session=…&map=…` read
///    from the old app's `diag.status` — works onto builds without this
///    class);
/// 4. [parseRoute] sends the app straight into [TvShell], which resumes the
///    session (fog, doors, tokens, camera come from the saved session).
///
/// The snapshot is tiny and written only when the view or session changes
/// and on every session auto-save, into its own Hive box (the install
/// SIGKILLs the app, so nothing can be saved on the way out). A normal launch
/// never restores — only the `/restore` route does.
///
/// The companion uses the route `/companion` (web: `…/#/companion`) to skip
/// the mode selector and connect; the TV then resends its game.
class DeployRestore {
  DeployRestore._();

  static const String _boxName = 'deployRestore';
  static const String _key = 'tv';

  /// Initial route that restores the TV.
  static const String tvRoute = '/restore';

  /// Initial route that opens the networked companion.
  static const String companionRoute = '/companion';

  static Box<String>? _box;

  static Future<Box<String>> _open() async =>
      _box ??= await Hive.openBox<String>(_boxName);

  /// Parses an initial route ([PlatformDispatcher.defaultRouteName]):
  /// `/restore[?session=…&map=…]` → TV target, `/companion` → companion,
  /// anything else → `null` (normal launch, mode selector).
  static RestoreTarget? parseRoute(String? route) {
    if (route == null || route.isEmpty) return null;
    final uri = Uri.tryParse(route);
    if (uri == null) return null;
    switch (uri.path) {
      case tvRoute:
        final session = uri.queryParameters['session'];
        return RestoreTarget(
          tv: true,
          sessionId: (session?.isEmpty ?? true) ? null : session,
          mapId: uri.queryParameters['map'],
        );
      case companionRoute:
        return const RestoreTarget(tv: false);
      default:
        return null;
    }
  }

  /// Saves the TV's current place: [view] (a `TvView` name), [mapId] and
  /// [sessionId] of the open game (both `null` outside a game).
  ///
  /// Errors are logged, never thrown — a missing snapshot only costs the
  /// restore, not the game.
  static Future<void> save({
    required String view,
    String? mapId,
    String? sessionId,
  }) async {
    try {
      final box = await _open();
      await box.put(_key, encode(view: view, mapId: mapId, sessionId: sessionId));
    } catch (e) {
      debugPrint('DeployRestore.save failed: $e');
    }
  }

  /// The TV's last saved place as a [RestoreTarget] — `null` when there is
  /// none or it was not a game (nothing to resume).
  static Future<RestoreTarget?> load() async {
    try {
      final box = await _open();
      return decode(box.get(_key));
    } catch (e) {
      debugPrint('DeployRestore.load failed: $e');
      return null;
    }
  }

  /// The snapshot's JSON (exposed for tests).
  @visibleForTesting
  static String encode({required String view, String? mapId, String? sessionId}) =>
      jsonEncode({
        'view': view,
        'mapId': mapId,
        'sessionId': sessionId,
        'savedAt': DateTime.now().toIso8601String(),
      });

  /// Reads a snapshot written by [encode]; `null` unless it is a game with a
  /// session (exposed for tests).
  @visibleForTesting
  static RestoreTarget? decode(String? json) {
    if (json == null) return null;
    final m = jsonDecode(json) as Map<String, dynamic>;
    final session = m['sessionId'] as String?;
    if (m['view'] != 'game' || session == null) return null;
    return RestoreTarget(tv: true, sessionId: session, mapId: m['mapId'] as String?);
  }
}
