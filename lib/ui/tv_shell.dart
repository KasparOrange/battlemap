import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_phoenix/flutter_phoenix.dart';
import 'package:uuid/uuid.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../game/vtt_game.dart';
import '../model/draw_stroke.dart';
import '../model/map_library_entry.dart';
import '../model/map_token.dart';
import '../model/session.dart';
import '../network/http_download_stub.dart'
    if (dart.library.io) '../network/http_download.dart';
import '../network/relay_config.dart';
import '../network/remote_log_stub.dart'
    if (dart.library.io) '../network/remote_log.dart';
import '../network/vtt_relay_client.dart';
import '../pdf_helper.dart';
import '../model/aoe_template.dart';
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
  bool _isPdfSession = false;

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
    WakelockPlus.enable(); // Keep TV screen on
    RemoteLog.sendDeviceInfo();
    _library.init().then((_) {
      _log('Library loaded: ${_library.entries.length} maps');
      if (mounted) setState(() {});
    });
    _connectRelay();
  }

  @override
  void dispose() {
    WakelockPlus.disable();
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
    // If TV is in game view, tell companion where to get the map
    if (_currentView == TvView.game && _state.map != null) {
      final entry = _activeMapId != null ? _library.getEntry(_activeMapId!) : null;
      if (entry?.isPdf == true && _state.map?.imageBytes != null) {
        // PDF: send rendered image via chunks (companion can't render PDFs)
        _log('Reconnect: sending rendered PDF image to companion');
        _relay.sendMapChunked(_state.map!.imageBytes);
      } else if (entry?.vpsUrl != null) {
        _log('Reconnect: telling companion to download map from ${entry!.vpsUrl}');
        _relay.sendRaw(jsonEncode({
          'type': 'vtt.downloadMap',
          'url': entry.vpsUrl,
          'displayName': entry.displayName,
        }));
      } else if (_state.rawMapBytes != null) {
        _log('Reconnect: sending raw map bytes via chunks');
        _relay.sendMapChunked(_state.rawMapBytes!);
      } else if (_state.map?.imageBytes != null) {
        _log('Reconnect: sending image bytes via chunks');
        _relay.sendMapChunked(_state.map!.imageBytes);
      }
    }
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

  // ─── PDF download + render ─────────────────────────────

  /// Downloads a PDF from the VPS, saves it to the library, renders the
  /// first page to an image, and starts a new session.
  ///
  /// Called when the companion sends a `vtt.pdfUploaded` command after
  /// uploading a PDF file to the VPS. The TV handles all rendering since
  /// pdfrx requires native platform support (not available on web).
  ///
  /// The [url] is the VPS HTTP download URL. [displayName] is shown in the
  /// library. [gridCols] and [gridRows] are the user-configured grid
  /// dimensions from the companion's grid config dialog.
  ///
  /// See also:
  /// - [PdfHelper.renderPdfPage], which does the actual PDF-to-PNG conversion.
  /// - [VttState.loadPdfAsMap], which creates a synthetic [UvttMap] from the image.
  Future<void> _downloadAndLoadPdf(
    String url,
    String displayName,
    int gridCols,
    int gridRows,
  ) async {
    try {
      _log('Downloading PDF from VPS: $url');
      setState(() => _transferProgress = 0.0);

      final pdfBytes = await httpDownload(url, onProgress: (p) {
        setState(() => _transferProgress = p);
      });
      setState(() => _transferProgress = null);

      if (pdfBytes == null) {
        _sendError('Failed to download PDF from $url');
        return;
      }
      _log('PDF download complete: ${pdfBytes.length} bytes');

      // Save PDF to library with isPdf flag
      final entry = await _library.addMap(
        pdfBytes,
        displayName,
        isPdf: true,
        pdfGridCols: gridCols,
        pdfGridRows: gridRows,
      );
      entry.vpsUrl = url;
      await _library.updateEntry(entry);
      _log('Saved PDF to library: ${entry.id} (vpsUrl=$url)');
      _sendLibraryListing();

      // Render first page to image bytes
      final rendered = await PdfHelper.renderPdfPage(pdfBytes);
      if (rendered == null) {
        _sendError('Failed to render PDF page');
        return;
      }

      final imageBytes = rendered['imageBytes'] as Uint8List;
      final width = rendered['width'] as int;
      final height = rendered['height'] as int;
      _log('PDF rendered: ${width}x$height (${(imageBytes.length / 1024).round()} KB)');

      // Load as map using the synthetic UvttMap path
      _state.loadPdfAsMap(
        imageBytes,
        gridCols: gridCols,
        gridRows: gridRows,
        imageWidth: width.toDouble(),
        imageHeight: height.toDouble(),
      );
      _ensureGame();
      _game!.zoomToFit();

      _activeMapId = entry.id;
      _activeSessionId = const Uuid().v4();
      _activeSessionName = 'Session 1';
      _sessionCreatedAt = DateTime.now();

      _setView(TvView.game);
      _state.addListener(_onStateChanged);

      // Initial save (mark as PDF session)
      await _saveCurrentSession(isPdfSession: true);

      // Send the rendered image to the companion so it can display the map.
      // The companion can't render PDFs on web, so we send the image bytes.
      if (_state.map?.imageBytes != null) {
        _log('Sending rendered PDF image to companion (${(_state.map!.imageBytes.length / 1024).round()} KB)');
        _relay.sendMapChunked(_state.map!.imageBytes);
      }
      _broadcastFullState();
      _log('PDF session started: $_activeSessionId');
    } catch (e, stack) {
      _sendError('PDF processing failed: $e');
      _log('Stack: ${stack.toString().split('\n').take(5).join(' | ')}');
      setState(() => _transferProgress = null);
    }
  }

  // ─── Image download from VPS ─────────────────────────────

  Future<void> _downloadAndLoadImage(
    String url, String displayName, int gridCols, int gridRows,
  ) async {
    try {
      _log('Downloading image from VPS: $url');
      setState(() => _transferProgress = 0.0);

      final imageBytes = await httpDownload(url, onProgress: (p) {
        setState(() => _transferProgress = p);
      });
      setState(() => _transferProgress = null);

      if (imageBytes == null) {
        _sendError('Failed to download image from $url');
        return;
      }
      _log('Image download complete: ${imageBytes.length} bytes');

      // Save to library as a "PDF" type (image with user grid config, no UVTT metadata)
      final entry = await _library.addMap(
        imageBytes, displayName,
        isPdf: true, pdfGridCols: gridCols, pdfGridRows: gridRows,
      );
      entry.vpsUrl = url;
      await _library.updateEntry(entry);
      _sendLibraryListing();

      // Decode image to get dimensions
      final codec = await ui.instantiateImageCodec(imageBytes);
      final frame = await codec.getNextFrame();
      final width = frame.image.width;
      final height = frame.image.height;
      frame.image.dispose();
      _log('Image decoded: ${width}x$height');

      // Load as map — imageBytes are already PNG/JPG, loadPdfAsMap handles it
      _state.loadPdfAsMap(
        imageBytes,
        gridCols: gridCols, gridRows: gridRows,
        imageWidth: width.toDouble(), imageHeight: height.toDouble(),
      );
      _ensureGame();
      _game!.zoomToFit();

      _activeMapId = entry.id;
      _activeSessionId = const Uuid().v4();
      _activeSessionName = 'Session 1';
      _sessionCreatedAt = DateTime.now();
      _isPdfSession = true;

      _setView(TvView.game);
      _state.addListener(_onStateChanged);
      await _saveCurrentSession();
      // Send rendered image to companion
      if (_state.map?.imageBytes != null) {
        _relay.sendMapChunked(_state.map!.imageBytes);
      }
      _broadcastFullState();
      _log('Image map loaded: ${entry.id}');
    } catch (e, stack) {
      _log('ERROR loading image: $e');
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

  /// Starts a new game session for the given [mapId].
  ///
  /// Loads the map bytes from the library, parses and displays it, creates
  /// a new session ID, and switches to game view. For PDF maps, renders the
  /// first page to an image before loading.
  ///
  /// If [sendMapToCompanion] is `true`, sends a download URL or chunked
  /// transfer so the companion can display the map locally.
  ///
  /// See also:
  /// - [_resumeSession] for restoring a previously saved session.
  /// - [_downloadAndLoadPdf] for the initial PDF upload flow.
  Future<void> _startNewSession(String mapId, String name,
      {bool sendMapToCompanion = true}) async {
    try {
      _log('Starting new session: mapId=$mapId, name="$name", sendMap=$sendMapToCompanion');
      final entry = _library.getEntry(mapId);
      final bytes = await _library.loadMapBytes(mapId);
      _log('Map loaded from disk: ${bytes.length} bytes');

      // Check if this is a PDF map — render page to image first
      if (entry?.isPdf == true) {
        final rendered = await PdfHelper.renderPdfPage(bytes);
        if (rendered == null) {
          _sendError('Failed to render PDF page for map $mapId');
          return;
        }
        final imageBytes = rendered['imageBytes'] as Uint8List;
        final width = rendered['width'] as int;
        final height = rendered['height'] as int;
        final gridCols = entry!.pdfGridCols ?? 20;
        final gridRows = entry.pdfGridRows ?? 15;
        _log('PDF rendered: ${width}x$height, grid ${gridCols}x$gridRows');
        _state.loadPdfAsMap(
          imageBytes,
          gridCols: gridCols,
          gridRows: gridRows,
          imageWidth: width.toDouble(),
          imageHeight: height.toDouble(),
        );
      } else {
        _state.loadMap(bytes);
      }
      _ensureGame();
      _game!.zoomToFit();

      _activeMapId = mapId;
      _activeSessionId = const Uuid().v4();
      _activeSessionName = name;
      _sessionCreatedAt = DateTime.now();

      _setView(TvView.game);
      _state.addListener(_onStateChanged);

      // Initial save
      await _saveCurrentSession(isPdfSession: entry?.isPdf == true);

      // Tell companion where to download the map (if they don't already have it)
      if (sendMapToCompanion) {
        if (entry?.isPdf == true && _state.map?.imageBytes != null) {
          // PDF: send rendered image via chunks (companion can't render PDFs)
          _log('Sending rendered PDF image to companion (${(_state.map!.imageBytes.length / 1024).round()} KB)');
          _relay.sendMapChunked(_state.map!.imageBytes);
        } else if (entry?.vpsUrl != null) {
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

  /// Resumes a previously saved session.
  ///
  /// Loads the session from disk, restores all state (fog, portals, tokens,
  /// drawings, camera), and switches to game view. For PDF sessions, renders
  /// the PDF page before loading.
  ///
  /// Sends the map to the companion via download URL or chunked transfer so
  /// it can display the map locally.
  ///
  /// See also:
  /// - [_startNewSession] for creating fresh sessions.
  /// - [_saveCurrentSession] for the auto-save mechanism.
  Future<void> _resumeSession(String sessionId) async {
    try {
      _log('Resuming session: $sessionId');
      final session = await _library.loadSession(sessionId);
      if (session == null) {
        _log('ERROR: session not found: $sessionId');
        return;
      }

      final entry = _library.getEntry(session.mapId);
      final bytes = await _library.loadMapBytes(session.mapId);
      _log('Map loaded from disk: ${bytes.length} bytes');

      // Check if this is a PDF session — render page to image first
      final isPdf = session.isPdfSession || (entry?.isPdf == true);
      if (isPdf) {
        final rendered = await PdfHelper.renderPdfPage(bytes);
        if (rendered == null) {
          _sendError('Failed to render PDF page for session $sessionId');
          return;
        }
        final imageBytes = rendered['imageBytes'] as Uint8List;
        final width = rendered['width'] as int;
        final height = rendered['height'] as int;
        final gridCols = entry?.pdfGridCols ?? 20;
        final gridRows = entry?.pdfGridRows ?? 15;
        _log('PDF rendered: ${width}x$height, grid ${gridCols}x$gridRows');
        _state.loadPdfAsMap(
          imageBytes,
          gridCols: gridCols,
          gridRows: gridRows,
          imageWidth: width.toDouble(),
          imageHeight: height.toDouble(),
        );
      } else {
        _state.loadMap(bytes);
      }
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

      // Restore tokens and drawings
      _state.tokens = session.tokenData
          .map((t) => MapToken.fromJson(t))
          .toList();
      _state.strokes = session.strokeData
          .map((s) => DrawStroke.fromJson(s))
          .toList();
      _state.drawColor = Color(session.drawColorValue);
      _state.drawWidth = session.drawWidth;
      final modeName = session.interactionMode;
      _state.interactionMode = InteractionMode.values.firstWhere(
        (m) => m.name == modeName,
        orElse: () => InteractionMode.fogReveal,
      );

      _activeMapId = session.mapId;
      _activeSessionId = session.id;
      _activeSessionName = session.name;
      _sessionCreatedAt = session.createdAt;
      _isPdfSession = isPdf;

      _setView(TvView.game);
      _state.addListener(_onStateChanged);

      _game!.syncCamera(
          session.cameraX, session.cameraY, session.cameraZoom, session.cameraAngle);

      // Send map to companion so it can display it
      _log('Send map: isPdf=$isPdf, hasMap=${_state.map != null}, hasImageBytes=${_state.map?.imageBytes != null}, imageLen=${_state.map?.imageBytes?.length}');
      if (isPdf && _state.map?.imageBytes != null) {
        // PDF: send rendered image via chunks (companion can't render PDFs)
        _log('Sending rendered PDF image to companion (${(_state.map!.imageBytes.length / 1024).round()} KB)');
        _relay.sendMapChunked(_state.map!.imageBytes);
      } else if (entry?.vpsUrl != null) {
        // UVTT: tell companion to download from VPS
        _log('Telling companion to download map from ${entry!.vpsUrl}');
        _relay.sendRaw(jsonEncode({
          'type': 'vtt.downloadMap',
          'url': entry.vpsUrl,
          'displayName': entry.displayName,
        }));
      } else if (_state.rawMapBytes != null) {
        // Fallback: send raw bytes via chunks
        _log('No VPS URL, sending raw map bytes via chunks');
        _relay.sendMapChunked(_state.rawMapBytes!);
      } else if (_state.map?.imageBytes != null) {
        // Last resort: send image bytes
        _log('No VPS URL or raw bytes, sending image bytes via chunks');
        _relay.sendMapChunked(_state.map!.imageBytes);
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

  /// Saves the current session state to disk.
  ///
  /// If [isPdfSession] is provided, it updates [_isPdfSession] and includes
  /// it in the serialized session so that future resumes know to render the
  /// PDF page before loading.
  ///
  /// Called both from the initial session creation and from the 2-second
  /// auto-save timer.
  Future<void> _saveCurrentSession({bool? isPdfSession}) async {
    if (_activeSessionId == null || _activeMapId == null) return;
    if (isPdfSession != null) _isPdfSession = isPdfSession;
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
      tokenData: _state.tokens.map((t) => t.toJson()).toList(),
      strokeData: _state.strokes.map((s) => s.toJson()).toList(),
      drawColorValue: _state.drawColor.toARGB32(),
      drawWidth: _state.drawWidth,
      interactionMode: _state.interactionMode.name,
      cameraX: (camera['x'] as num).toDouble(),
      cameraY: (camera['y'] as num).toDouble(),
      cameraZoom: (camera['zoom'] as num).toDouble(),
      cameraAngle: (camera['angle'] as num).toDouble(),
      isPdfSession: _isPdfSession,
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
      'isPdfSession': _isPdfSession,
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
    _log('Restarting app (Phoenix rebirth) to apply Shorebird patch...');
    _relay.sendRaw(jsonEncode({
      'type': 'patch.progress',
      'status': 'Restarting...',
      'progress': 1.0,
    }));
    // Save current session, then rebirth the Dart VM (applies Shorebird patch)
    _saveCurrentSession().then((_) {
      if (mounted) {
        Phoenix.rebirth(context);
      }
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
          type == 'vtt.resetCalibration' || type == 'vtt.clearMap' ||
          type == 'vtt.pdfUploaded' || type == 'vtt.imageUploaded') {
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

        // PDF uploaded to VPS — TV downloads, renders, and loads as map
        case 'vtt.pdfUploaded':
          _downloadAndLoadPdf(
            msg['url'] as String,
            msg['displayName'] as String? ?? 'PDF map',
            msg['gridCols'] as int? ?? 20,
            msg['gridRows'] as int? ?? 15,
          );

        // Image uploaded to VPS — TV downloads and loads directly as map
        case 'vtt.imageUploaded':
          _downloadAndLoadImage(
            msg['url'] as String,
            msg['displayName'] as String? ?? 'Image map',
            msg['gridCols'] as int? ?? 20,
            msg['gridRows'] as int? ?? 15,
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
        case 'vtt.editToken':
          _state.editToken(
            msg['id'] as String,
            name: msg['name'] as String?,
            maxHp: msg['maxHp'] as int?,
            currentHp: msg['currentHp'] as int?,
            conditions: (msg['conditions'] as List?)?.cast<String>().toSet(),
          );
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
          _broadcastFullState();
        case 'vtt.zoomOut':
          _game?.zoomOut();
          _broadcastFullState();
        case 'vtt.zoomToFit':
          _game?.zoomToFit();
          _broadcastFullState();
        case 'vtt.rotateCW':
          _game?.rotateCW();
          _broadcastFullState();
        case 'vtt.rotateCCW':
          _game?.rotateCCW();
          _broadcastFullState();
        case 'vtt.resetRotation':
          _game?.resetRotation();
          _broadcastFullState();
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

        // Undo / Redo
        case 'vtt.undo':
          _state.undo();
        case 'vtt.redo':
          _state.redo();

        // Shadow mode
        case 'vtt.toggleShadowMode':
          _state.toggleShadowMode();
        case 'vtt.commitShadow':
          _state.commitShadow();
        case 'vtt.clearShadow':
          _state.clearShadow();

        // Room reveal
        case 'vtt.roomReveal':
          final cells = (msg['cells'] as List).cast<int>().toSet();
          _state.revealRoom(cells);

        // AoE templates
        case 'vtt.setAoe':
          _state.setAoe(AoeTemplate.fromJson(msg));
        case 'vtt.clearAoe':
          _state.clearAoe();
      }
    } catch (e) {
      _sendError('Command dispatch error: $e');
    }
  }

  // ─── Build ──────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _currentView == TvView.waiting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          _navigateBack();
        }
      },
      child: Focus(
        autofocus: true,
        onKeyEvent: (node, event) {
          if (event is KeyDownEvent) {
            _log('Key: ${event.logicalKey.keyLabel}');
            if (event.logicalKey == LogicalKeyboardKey.goBack ||
                event.logicalKey == LogicalKeyboardKey.escape ||
                event.logicalKey == LogicalKeyboardKey.browserBack) {
              _navigateBack();
              return KeyEventResult.handled;
            }
          }
          return KeyEventResult.ignored;
        },
        child: Scaffold(
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
                  onPressed: _navigateBack,
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
        ),
      ),
    );
  }

  void _navigateBack() {
    _log('navigateBack from ${_currentView.name}');
    if (_currentView == TvView.game) {
      _state.removeListener(_onStateChanged);
      _setView(TvView.library);
      _broadcastFullState();
      _sendLibraryListing();
    } else if (_currentView == TvView.waiting) {
      Navigator.pop(context);
    } else {
      _setView(TvView.waiting);
      _broadcastFullState();
    }
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
              'Map Library is empty\nUpload a map or PDF from your phone',
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
    return _FocusableCard(
      onSelect: () {
        // Start new session with this map (TV remote fallback)
        _startNewSession(entry.id, 'Session');
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            entry.isPdf ? Icons.picture_as_pdf : Icons.map,
            color: entry.isPdf ? Colors.redAccent.withValues(alpha: 0.5) : Colors.white24,
            size: 32,
          ),
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
            entry.isPdf
                ? '${entry.gridCols}x${entry.gridRows} grid  •  PDF  •  '
                  '${(entry.fileSizeBytes / 1024 / 1024).toStringAsFixed(1)} MB'
                : '${entry.gridCols}x${entry.gridRows} grid  •  '
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

/// A card widget that responds to D-pad focus and Select/Enter key.
/// Used in the TV library grid for remote control fallback.
class _FocusableCard extends StatefulWidget {
  final VoidCallback onSelect;
  final Widget child;

  const _FocusableCard({required this.onSelect, required this.child});

  @override
  State<_FocusableCard> createState() => _FocusableCardState();
}

class _FocusableCardState extends State<_FocusableCard> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    return Focus(
      onFocusChange: (focused) => setState(() => _focused = focused),
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent &&
            (event.logicalKey == LogicalKeyboardKey.select ||
             event.logicalKey == LogicalKeyboardKey.enter ||
             event.logicalKey == LogicalKeyboardKey.gameButtonA)) {
          widget.onSelect();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: GestureDetector(
        onTap: widget.onSelect,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _focused
                ? Colors.white.withValues(alpha: 0.15)
                : Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: _focused
                  ? Colors.greenAccent.withValues(alpha: 0.6)
                  : Colors.white.withValues(alpha: 0.1),
              width: _focused ? 2.0 : 1.0,
            ),
          ),
          child: widget.child,
        ),
      ),
    );
  }
}
