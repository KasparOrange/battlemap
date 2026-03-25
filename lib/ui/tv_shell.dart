import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import '../game/vtt_game.dart';
import '../model/draw_stroke.dart';
import '../model/map_library_entry.dart';
import '../model/session.dart';
import '../network/http_download_stub.dart'
    if (dart.library.io) '../network/http_download.dart';
import '../network/relay_config.dart';
import '../network/remote_log_stub.dart'
    if (dart.library.io) '../network/remote_log.dart';
import '../network/vtt_relay_client.dart';
import '../state/vtt_state.dart';
import '../storage/map_library.dart';
import '../update/update_service_stub.dart'
    if (dart.library.io) '../update/update_service.dart';

/// The set of views that the TV can display.
///
/// The companion phone controls which view is active by sending
/// `nav.*` commands through the [VttRelayClient].
enum TvView {
  /// Idle screen shown on startup, waiting for the companion to connect.
  waiting,

  /// Map library browser — shows stored maps and saved sessions.
  library,

  /// Active game session displaying the [VttGame] Flame canvas.
  game,

  /// Settings placeholder (not yet implemented).
  settings,
}

/// Top-level widget for Table Mode (TV).
///
/// The TV box runs this as a pure rendering surface with no local touch
/// input. All interaction arrives from the companion phone over the
/// [VttRelayClient] WebSocket relay. This widget manages:
///
/// - Relay connection lifecycle and command dispatch.
/// - Persistent on-disk [MapLibrary] (add, delete, list maps & sessions).
/// - Session management (create, resume, auto-save every 2 seconds).
/// - View navigation (waiting, library, game, settings) driven by the
///   companion.
/// - Throttled full-state broadcasts to keep the companion's preview
///   in sync (up to 20 Hz).
/// - OTA update flow (check, download, install APK).
///
/// See also:
/// - [VttCompanionScreen], the phone-side counterpart.
/// - [VttRelayClient], the networking layer.
/// - [VttGame], the Flame game engine component tree.
class TvShell extends StatefulWidget {
  /// Creates the TV shell widget.
  const TvShell({super.key});

  @override
  State<TvShell> createState() => _TvShellState();
}

class _TvShellState extends State<TvShell> {
  // Core state
  final VttState _state = VttState();
  VttGame? _game;
  final MapLibrary _library = MapLibrary();

  // Relay
  late final VttRelayClient _relay;
  RelayConnectionState _relayState = RelayConnectionState.disconnected;
  StreamSubscription<RelayConnectionState>? _relaySub;
  double? _transferProgress;

  // Navigation
  TvView _currentView = TvView.waiting;

  // Active session
  String? _activeMapId;
  String? _activeSessionId;
  String _activeSessionName = 'Session';
  DateTime? _sessionCreatedAt;

  // Update state
  double? _updateProgress;
  String _updateStatus = '';

  // Throttled state broadcast
  bool _dirty = false;
  Timer? _broadcastTimer;

  // Auto-save
  Timer? _autoSaveTimer;

  void _log(String msg) {
    debugPrint('TvShell: $msg');
    RemoteLog.send(msg);
    // Also send through relay so we can see it in logs even if RemoteLog is broken
    try {
      _relay.sendRaw(jsonEncode({'type': 'tv.log', 'msg': msg}));
    } catch (_) {}
  }

  void _setView(TvView view) {
    setState(() => _currentView = view);
    RemoteLog.sendEvent('viewChange', {'msg': 'View: ${view.name}', 'view': view.name});
  }

  @override
  void initState() {
    super.initState();
    _state.isInteractive = false; // TV has no touch
    RemoteLog.sendDeviceInfo();
    _library.init().then((_) {
      _log('Library loaded: ${_library.entries.length} maps');
      if (mounted) setState(() {});
    });
    _connectRelay();
  }

  @override
  void dispose() {
    _state.removeListener(_onStateChanged);
    _broadcastTimer?.cancel();
    _autoSaveTimer?.cancel();
    _relaySub?.cancel();
    _relay.dispose();
    _state.dispose();
    super.dispose();
  }

  // ─── Relay ───────────────────────────────────────────────

  void _connectRelay() {
    _relay = VttRelayClient(role: 'table');
    _relay.onCommand = _handleCommand;
    _relay.onMapLoaded = _onMapReceived;
    _relay.onTransferProgress = (p) {
      setState(() => _transferProgress = p < 0 ? null : p);
    };
    _relaySub = _relay.stateStream.listen((s) {
      final wasPaired = _relayState == RelayConnectionState.paired;
      setState(() => _relayState = s);

      if (s == RelayConnectionState.paired) {
        RemoteLog.sendEvent('relay', {'msg': 'Companion paired', 'state': 'paired'});
        // Auto-navigate to library when companion connects
        if (_currentView == TvView.waiting) {
          _setView(TvView.library);
        }
        _sendInitialState();
      } else if (wasPaired && s != RelayConnectionState.paired) {
        // Companion disconnected — stay on current view
      }
    });
    _relay.connect();
  }

  void _sendInitialState() {
    // Send library listing
    _sendLibraryListing();
    // Send current view + game state
    _broadcastFullState();
  }

  void _broadcastFullState() {
    if (_relayState != RelayConnectionState.paired) return;
    final stateJson = _state.toJson();
    stateJson['tvView'] = _currentView.name;
    stateJson['activeMapId'] = _activeMapId;
    stateJson['activeSessionId'] = _activeSessionId;
    final camera = _game?.getCameraState() ?? {'x': 0.0, 'y': 0.0, 'zoom': 1.0, 'angle': 0.0};
    _relay.sendFullState(stateJson, camera);
  }

  // ─── State changes ──────────────────────────────────────

  void _onStateChanged() {
    setState(() {});
    _dirty = true;
    _broadcastTimer ??= Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (_dirty && _relayState == RelayConnectionState.paired) {
        _dirty = false;
        _broadcastFullState();
      }
    });
    _markDirtyForAutoSave();
  }

  // ─── Map download from VPS (HTTP) ────────────────────────

  Future<void> _downloadMapFromVps(String url, String displayName) async {
    try {
      _log('Downloading map from VPS: $url');
      setState(() => _transferProgress = 0.0);

      final bytes = await httpDownload(url, onProgress: (p) {
        setState(() => _transferProgress = p);
      });
      setState(() => _transferProgress = null);

      if (bytes == null) {
        _log('ERROR: failed to download map from $url');
        return;
      }
      _log('Download complete: ${bytes.length} bytes');

      final entry = await _library.addMap(bytes, displayName);
      entry.vpsUrl = url; // remember VPS URL so companion can download later
      await _library.updateEntry(entry);
      _log('Saved to library: ${entry.id} (vpsUrl=$url)');
      _sendLibraryListing();
      await _startNewSession(entry.id, 'Session 1', sendMapToCompanion: false);
    } catch (e, stack) {
      _log('ERROR downloading map: $e');
      _log('Stack: ${stack.toString().split('\n').take(3).join(' | ')}');
      setState(() => _transferProgress = null);
    }
  }

  // ─── Map received via chunked transfer (fallback) ───────

  Future<void> _onMapReceived(Uint8List bytes) async {
    final name = _relay.lastMapDisplayName ?? 'Uploaded map';
    RemoteLog.sendEvent('mapReceived', {
      'msg': 'Map received: "$name" (${(bytes.length / 1024 / 1024).toStringAsFixed(1)} MB)',
      'name': name,
      'sizeBytes': bytes.length,
    });

    final entry = await _library.addMap(bytes, name);
    _log('Saved to library: ${entry.id}');

    _sendLibraryListing();
    await _startNewSession(entry.id, 'Session 1', sendMapToCompanion: false);
  }

  // ─── Session management ─────────────────────────────────

  Future<void> _startNewSession(String mapId, String name,
      {bool sendMapToCompanion = true}) async {
    try {
      _log('Starting new session: mapId=$mapId, name="$name", sendMap=$sendMapToCompanion');
      final bytes = await _library.loadMapBytes(mapId);
      _log('Map loaded from disk: ${bytes.length} bytes');
      _state.loadMap(bytes);
      _ensureGame();
      _game!.zoomToFit();

      _activeMapId = mapId;
      _activeSessionId = const Uuid().v4();
      _activeSessionName = name;
      _sessionCreatedAt = DateTime.now();

      _setView(TvView.game);
      _state.addListener(_onStateChanged);

      // Initial save
      await _saveCurrentSession();

      // Tell companion where to download the map (if they don't already have it)
      if (sendMapToCompanion) {
        final entry = _library.getEntry(mapId);
        if (entry?.vpsUrl != null) {
          _log('Telling companion to download map from ${entry!.vpsUrl}');
          _relay.sendRaw(jsonEncode({
            'type': 'vtt.downloadMap',
            'url': entry.vpsUrl,
            'displayName': entry.displayName,
          }));
        } else {
          _log('No VPS URL for map, sending via chunks');
          _relay.sendMapChunked(bytes);
        }
      }
      _broadcastFullState();
      _log('Session started: $_activeSessionId');
    } catch (e, stack) {
      _log('ERROR in _startNewSession: $e');
      _log('Stack: ${stack.toString().split('\n').take(5).join(' | ')}');
      RemoteLog.sendEvent('error', {'msg': 'startNewSession failed: $e', 'mapId': mapId});
    }
  }

  Future<void> _resumeSession(String sessionId) async {
    try {
      _log('Resuming session: $sessionId');
      final session = await _library.loadSession(sessionId);
      if (session == null) {
        _log('ERROR: session not found: $sessionId');
        return;
      }

      final bytes = await _library.loadMapBytes(session.mapId);
      _log('Map loaded from disk: ${bytes.length} bytes');
      _state.loadMap(bytes);
      _ensureGame();

      _state.revealedCells = Set<int>.from(session.revealedCells);
      _state.openPortals = Set<int>.from(session.openPortals);
      _state.showGrid = session.showGrid;
      _state.fogEnabled = session.fogEnabled;
      _state.showWalls = session.showWalls;
      _state.brushRadius = session.brushRadius;
      _state.revealMode = session.revealMode;
      _state.tvWidthInches = session.tvWidthInches;
      _state.calibratedBaseZoom = session.calibratedBaseZoom;

      _activeMapId = session.mapId;
      _activeSessionId = session.id;
      _activeSessionName = session.name;
      _sessionCreatedAt = session.createdAt;

      _setView(TvView.game);
      _state.addListener(_onStateChanged);

      _game!.syncCamera(
          session.cameraX, session.cameraY, session.cameraZoom, session.cameraAngle);

      // Tell companion to download map from VPS (fast) instead of chunked relay
      final entry = _library.getEntry(session.mapId);
      if (entry?.vpsUrl != null) {
        _relay.sendRaw(jsonEncode({
          'type': 'vtt.downloadMap',
          'url': entry!.vpsUrl,
          'displayName': entry.displayName,
        }));
      }
      _broadcastFullState();
      _log('Session resumed: ${session.name}');
    } catch (e, stack) {
      _log('ERROR in _resumeSession: $e');
      _log('Stack: ${stack.toString().split('\n').take(5).join(' | ')}');
      RemoteLog.sendEvent('error', {'msg': 'resumeSession failed: $e', 'sessionId': sessionId});
    }
  }

  void _ensureGame() {
    if (_game == null) {
      _game = VttGame(state: _state);
    }
  }

  // ─── Auto-save ──────────────────────────────────────────

  void _markDirtyForAutoSave() {
    if (_activeSessionId == null) return;
    _autoSaveTimer?.cancel();
    _autoSaveTimer = Timer(const Duration(seconds: 2), () {
      _saveCurrentSession();
    });
  }

  Future<void> _saveCurrentSession() async {
    if (_activeSessionId == null || _activeMapId == null) return;
    final camera = _game?.getCameraState() ?? {'x': 0.0, 'y': 0.0, 'zoom': 1.0, 'angle': 0.0};
    final session = Session(
      id: _activeSessionId!,
      mapId: _activeMapId!,
      name: _activeSessionName,
      createdAt: _sessionCreatedAt ?? DateTime.now(),
      lastModifiedAt: DateTime.now(),
      revealedCells: _state.revealedCells.toList(),
      openPortals: _state.openPortals.toList(),
      showGrid: _state.showGrid,
      fogEnabled: _state.fogEnabled,
      showWalls: _state.showWalls,
      brushRadius: _state.brushRadius,
      revealMode: _state.revealMode,
      tvWidthInches: _state.tvWidthInches,
      calibratedBaseZoom: _state.calibratedBaseZoom,
      cameraX: (camera['x'] as num).toDouble(),
      cameraY: (camera['y'] as num).toDouble(),
      cameraZoom: (camera['zoom'] as num).toDouble(),
      cameraAngle: (camera['angle'] as num).toDouble(),
    );
    await _library.saveSession(session);
    RemoteLog.sendEvent('sessionSaved', {
      'msg': 'Saved session "${session.name}" (${session.revealedCells.length} cells)',
      'session': session.name,
      'cells': session.revealedCells.length,
    });
  }

  // ─── Diagnostics ─────────────────────────────────────────

  void _sendDiagStatus() {
    final status = {
      'type': 'diag.statusResponse',
      'view': _currentView.name,
      'relayState': _relayState.name,
      'mapCount': _library.entries.length,
      'activeMapId': _activeMapId,
      'activeSessionId': _activeSessionId,
      'hasLoadedMap': _state.map != null,
      'hasGame': _game != null,
      'revealedCells': _state.revealedCells.length,
      'openPortals': _state.openPortals.length,
      'fogEnabled': _state.fogEnabled,
      'showGrid': _state.showGrid,
      'calibrated': _state.calibratedBaseZoom != null,
    };
    _relay.sendRaw(jsonEncode(status));
    // Also log it
    RemoteLog.sendEvent('diagStatus', {'msg': 'Diag status sent', ...status});
  }

  // ─── Update ─────────────────────────────────────────────

  Future<void> _handleUpdateCheck() async {
    _log('Checking for update...');
    final info = await checkForUpdate();
    if (info == null) {
      _relay.sendRaw(jsonEncode({
        'type': 'update.versionInfo',
        'error': 'Failed to check for updates',
      }));
      return;
    }
    _log('Update check: current=${info.currentVersion}, '
        'available=${info.availableVersion}, hasUpdate=${info.hasUpdate}');
    _relay.sendRaw(jsonEncode({
      'type': 'update.versionInfo',
      ...info.toJson(),
    }));
  }

  Future<void> _handleUpdateDownload() async {
    _log('Starting update download...');
    setState(() {
      _updateProgress = 0.0;
      _updateStatus = 'Downloading...';
    });
    _relay.sendRaw(jsonEncode({
      'type': 'update.progress',
      'progress': 0.0,
      'status': 'Downloading...',
    }));

    await downloadAndInstall(
      onProgress: (p) {
        setState(() => _updateProgress = p);
        _relay.sendRaw(jsonEncode({
          'type': 'update.progress',
          'progress': p,
          'status': 'Downloading... ${(p * 100).toInt()}%',
        }));
      },
      onStatus: (status) {
        _log('Update status: $status');
        setState(() => _updateStatus = status);
        _relay.sendRaw(jsonEncode({
          'type': 'update.progress',
          'progress': _updateProgress ?? 1.0,
          'status': status,
        }));
      },
    );

    setState(() {
      _updateProgress = null;
      _updateStatus = '';
    });
  }

  // ─── Shorebird OTA patches ──────────────────────────────
  //
  // With auto_update: true in shorebird.yaml, patches are downloaded
  // automatically on app launch. The "restart" command applies them.

  void _handlePatchRestart() {
    _log('Restarting app to apply Shorebird patch...');
    _relay.sendRaw(jsonEncode({
      'type': 'patch.progress',
      'status': 'Restarting...',
      'progress': 1.0,
    }));
    // Save current session before restart
    _saveCurrentSession().then((_) {
      SystemNavigator.pop();
    });
  }

  // ─── Library listing ────────────────────────────────────

  Future<void> _sendLibraryListing() async {
    final sessions = await _library.listSessions();
    final listing = {
      'type': 'lib.listing',
      'maps': _library.entries.map((e) => {
        ...e.toJson(),
        'thumbnailAvailable': _library.hasThumbnail(e.id),
      }).toList(),
      'sessions': sessions.map((s) => {
        ...s.toJson(),
        'thumbnailAvailable': _library.hasThumbnail(s.id, isSession: true),
      }).toList(),
    };
    _relay.sendRaw(jsonEncode(listing));
  }

  // ─── Error reporting ────────────────────────────────────

  void _sendError(String msg) {
    _relay.sendRaw(jsonEncode({'type': 'tv.error', 'msg': msg}));
    _log('ERROR: $msg');
  }

  // ─── Command dispatch ───────────────────────────────────

  void _handleCommand(Map<String, dynamic> msg) {
    try {
      final type = msg['type'] as String;
      // Log structured events for non-high-frequency commands
      if (type.startsWith('nav.') || type.startsWith('lib.') ||
          type == 'vtt.toggleFog' || type == 'vtt.toggleGrid' ||
          type == 'vtt.toggleWalls' || type == 'vtt.toggleRevealMode' ||
          type == 'vtt.togglePortal' || type == 'vtt.revealAll' ||
          type == 'vtt.hideAll' || type == 'vtt.calibrate' ||
          type == 'vtt.resetCalibration' || type == 'vtt.clearMap') {
        RemoteLog.sendEvent('cmd', {'type': type, 'msg': 'Command: $type'});
      }

      switch (type) {
        // Navigation
        case 'nav.goToLibrary':
          _state.removeListener(_onStateChanged);
          _setView(TvView.library);
          _broadcastFullState();
          _sendLibraryListing();

        case 'nav.goToSettings':
          _setView(TvView.settings);
          _broadcastFullState();

        case 'nav.goToGame':
          final mapId = msg['mapId'] as String?;
          if (mapId == null || mapId.isEmpty) {
            _sendError('nav.goToGame: missing or empty mapId');
            return;
          }
          final sessionId = msg['sessionId'] as String?;
          if (sessionId != null && sessionId.isNotEmpty) {
            _resumeSession(sessionId);
          } else {
            _startNewSession(mapId, msg['name'] as String? ?? 'Session');
          }

        case 'nav.newSession':
          final mapId = msg['mapId'] as String?;
          if (mapId == null || mapId.isEmpty) {
            _sendError('nav.newSession: missing or empty mapId');
            return;
          }
          final name = msg['name'] as String? ?? 'Session';
          _startNewSession(mapId, name);

        // Library
        case 'lib.requestList':
          _sendLibraryListing();

        case 'lib.deleteMap':
          final mapId = msg['mapId'] as String?;
          if (mapId == null || mapId.isEmpty) {
            _sendError('lib.deleteMap: missing or empty mapId');
            return;
          }
          () async {
            try {
              await _library.deleteMap(mapId);
              _sendLibraryListing();
              if (mounted) setState(() {});
            } catch (e) {
              _sendError('lib.deleteMap failed: $e');
            }
          }();

        case 'lib.deleteSession':
          final sessionId = msg['sessionId'] as String?;
          if (sessionId == null || sessionId.isEmpty) {
            _sendError('lib.deleteSession: missing or empty sessionId');
            return;
          }
          () async {
            try {
              await _library.deleteSession(sessionId);
              _sendLibraryListing();
            } catch (e) {
              _sendError('lib.deleteSession failed: $e');
            }
          }();

        case 'lib.renameSession':
          final sessionId = msg['sessionId'] as String?;
          if (sessionId == null || sessionId.isEmpty) {
            _sendError('lib.renameSession: missing or empty sessionId');
            return;
          }
          final name = msg['name'] as String?;
          if (name == null || name.isEmpty) {
            _sendError('lib.renameSession: missing or empty name');
            return;
          }
          () async {
            try {
              final session = await _library.loadSession(sessionId);
              if (session == null) {
                _sendError('lib.renameSession: session not found: $sessionId');
                return;
              }
              session.name = name;
              await _library.saveSession(session);
              _sendLibraryListing();
            } catch (e) {
              _sendError('lib.renameSession failed: $e');
            }
          }();

        // Map uploaded to VPS — TV downloads via HTTP
        case 'vtt.mapUploaded':
          _downloadMapFromVps(
            msg['url'] as String,
            msg['displayName'] as String? ?? 'Uploaded map',
          );

        // Diagnostics — respond with TV state
        case 'diag.status':
          _sendDiagStatus();

        // Update commands (legacy APK install)
        case 'update.check':
          _handleUpdateCheck();
        case 'update.download':
          _handleUpdateDownload();

        // Shorebird OTA — restart to apply auto-downloaded patch
        case 'patch.restart':
          _handlePatchRestart();

        // Interaction mode
        case 'vtt.setMode':
          final mode = msg['mode'] as String;
          _state.setInteractionMode(
            InteractionMode.values.firstWhere((m) => m.name == mode,
              orElse: () => InteractionMode.fogReveal));

        // Tokens
        case 'vtt.addToken':
          _state.addToken(msg['gridX'] as int, msg['gridY'] as int);
        case 'vtt.moveToken':
          _state.moveToken(msg['id'] as String, msg['gridX'] as int, msg['gridY'] as int);
        case 'vtt.removeToken':
          _state.removeToken(msg['id'] as String);
        case 'vtt.clearTokens':
          _state.clearTokens();

        // Drawing
        case 'vtt.addStroke':
          final strokeData = msg['stroke'] as Map<String, dynamic>;
          _state.addStroke(DrawStroke.fromJson(strokeData));
        case 'vtt.strokeUpdate':
          final strokeData = msg['stroke'] as Map<String, dynamic>?;
          _state.setLiveStroke(strokeData != null ? DrawStroke.fromJson(strokeData) : null);
        case 'vtt.strokeEnd':
          _state.setLiveStroke(null);
        case 'vtt.clearDrawings':
          _state.clearDrawings();
        case 'vtt.undoStroke':
          _state.undoStroke();
        case 'vtt.setDrawColor':
          _state.setDrawColor(Color(msg['color'] as int));
        case 'vtt.setDrawWidth':
          _state.setDrawWidth((msg['width'] as num).toDouble());

        // Game commands (only when in game view)
        case 'vtt.clearMap':
          _state.clearMap();
        case 'vtt.toggleReveal':
          _state.toggleReveal(msg['index'] as int);
        case 'vtt.brushReveal':
          final indices = (msg['indices'] as List).cast<int>();
          _state.applyBrushReveal(indices);
        case 'vtt.revealAll':
          if (_state.map != null) {
            final total = _state.map!.resolution.mapSize.dx.toInt() *
                _state.map!.resolution.mapSize.dy.toInt();
            _state.revealAll(total);
          }
        case 'vtt.hideAll':
          _state.hideAll();
        case 'vtt.togglePortal':
          _state.togglePortal(msg['index'] as int);
        case 'vtt.toggleGrid':
          _state.toggleGrid();
        case 'vtt.toggleFog':
          _state.toggleFog();
        case 'vtt.toggleWalls':
          _state.toggleWalls();
        case 'vtt.setBrushRadius':
          _state.setBrushRadius(msg['radius'] as int);
        case 'vtt.toggleRevealMode':
          _state.toggleRevealMode();
        case 'vtt.zoomIn':
          _game?.zoomIn();
        case 'vtt.zoomOut':
          _game?.zoomOut();
        case 'vtt.zoomToFit':
          _game?.zoomToFit();
        case 'vtt.rotateCW':
          _game?.rotateCW();
        case 'vtt.rotateCCW':
          _game?.rotateCCW();
        case 'vtt.resetRotation':
          _game?.resetRotation();
        case 'vtt.calibrate':
          final screenWidth = MediaQueryData.fromView(
            WidgetsBinding.instance.platformDispatcher.views.first,
          ).size.width;
          _state.calibrate(
            (msg['tvWidthInches'] as num).toDouble(),
            screenWidth,
          );
        case 'vtt.resetCalibration':
          _state.resetCalibration();
      }
    } catch (e) {
      _sendError('Command dispatch error: $e');
    }
  }

  // ─── Build ──────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF111111),
      body: Stack(
        children: [
          // Main view
          _buildCurrentView(),

          // Back button (always visible)
          Positioned(
            top: 16,
            left: 16,
            child: IconButton(
              autofocus: true,
              icon: const Icon(Icons.arrow_back, color: Colors.white38),
              onPressed: () => Navigator.pop(context),
              focusColor: Colors.white.withValues(alpha: 0.2),
            ),
          ),

          // Relay status (top-right, always visible)
          Positioned(
            top: 16,
            right: 16,
            child: _buildRelayStatus(),
          ),

          // Transfer progress (centered overlay)
          if (_transferProgress != null) _buildTransferOverlay(),

          // Update progress (centered overlay)
          if (_updateProgress != null) _buildUpdateOverlay(),
        ],
      ),
    );
  }

  Widget _buildCurrentView() {
    switch (_currentView) {
      case TvView.waiting:
        return _buildWaitingView();
      case TvView.library:
        return _buildLibraryView();
      case TvView.game:
        if (_game != null) {
          return GameWidget(game: _game!);
        }
        return _buildWaitingView();
      case TvView.settings:
        return _buildSettingsView();
    }
  }

  Widget _buildWaitingView() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _relayState == RelayConnectionState.paired
                ? Icons.check_circle
                : _relayState == RelayConnectionState.connected
                    ? Icons.wifi_find
                    : Icons.cloud_off,
            color: _relayState == RelayConnectionState.paired
                ? Colors.greenAccent
                : Colors.white12,
            size: 64,
          ),
          const SizedBox(height: 16),
          Text(
            switch (_relayState) {
              RelayConnectionState.paired =>
                'Companion connected',
              RelayConnectionState.connected =>
                'Connected to relay\nOpen VTT Companion on your phone',
              RelayConnectionState.connecting => 'Connecting to relay...',
              RelayConnectionState.disconnected =>
                'Connecting to ${RelayConfig.host}...',
            },
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white38, fontSize: 18),
          ),
        ],
      ),
    );
  }

  Widget _buildLibraryView() {
    if (_library.entries.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.library_books, color: Colors.white12, size: 64),
            SizedBox(height: 16),
            Text(
              'Map Library is empty\nUpload a map from your phone',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white38, fontSize: 18),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(64, 64, 64, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Map Library',
            style: TextStyle(
              color: Colors.white54,
              fontSize: 24,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 24),
          Expanded(
            child: GridView.builder(
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 300,
                childAspectRatio: 1.3,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
              ),
              itemCount: _library.entries.length,
              itemBuilder: (context, index) {
                final entry = _library.entries[index];
                return _buildMapCard(entry);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapCard(MapLibraryEntry entry) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.map, color: Colors.white24, size: 32),
          const SizedBox(height: 8),
          Text(
            entry.displayName,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            '${entry.gridCols}x${entry.gridRows} grid  •  '
            '${(entry.fileSizeBytes / 1024 / 1024).toStringAsFixed(1)} MB',
            style: const TextStyle(
              color: Colors.white30,
              fontSize: 11,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsView() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.settings, color: Colors.white12, size: 64),
          SizedBox(height: 16),
          Text(
            'Settings',
            style: TextStyle(color: Colors.white38, fontSize: 18),
          ),
        ],
      ),
    );
  }

  Widget _buildRelayStatus() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            switch (_relayState) {
              RelayConnectionState.paired => Icons.wifi,
              RelayConnectionState.connected => Icons.wifi_find,
              RelayConnectionState.connecting => Icons.cloud_sync,
              RelayConnectionState.disconnected => Icons.cloud_off,
            },
            color: switch (_relayState) {
              RelayConnectionState.paired => Colors.greenAccent,
              RelayConnectionState.connected => Colors.orangeAccent,
              RelayConnectionState.connecting => Colors.orangeAccent,
              RelayConnectionState.disconnected => Colors.redAccent,
            },
            size: 16,
          ),
          const SizedBox(width: 6),
          Text(
            switch (_relayState) {
              RelayConnectionState.paired => 'Companion connected',
              RelayConnectionState.connected => 'Waiting for companion...',
              RelayConnectionState.connecting => 'Connecting...',
              RelayConnectionState.disconnected => 'Disconnected',
            },
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 13,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTransferOverlay() {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.downloading, color: Colors.white38, size: 48),
            const SizedBox(height: 16),
            SizedBox(
              width: 240,
              child: LinearProgressIndicator(
                value: _transferProgress,
                backgroundColor: Colors.white12,
                color: Colors.greenAccent,
                minHeight: 6,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Receiving map... ${(_transferProgress! * 100).toInt()}%',
              style: const TextStyle(color: Colors.white38, fontSize: 16),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUpdateOverlay() {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.system_update, color: Colors.blueAccent, size: 48),
            const SizedBox(height: 16),
            SizedBox(
              width: 240,
              child: LinearProgressIndicator(
                value: _updateProgress,
                backgroundColor: Colors.white12,
                color: Colors.blueAccent,
                minHeight: 6,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _updateStatus.isNotEmpty
                  ? _updateStatus
                  : 'Updating... ${(_updateProgress! * 100).toInt()}%',
              style: const TextStyle(color: Colors.white38, fontSize: 16),
            ),
          ],
        ),
      ),
    );
  }
}
