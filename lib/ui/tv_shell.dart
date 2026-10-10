import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_phoenix/flutter_phoenix.dart';
import 'package:uuid/uuid.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../game/vtt_game.dart';
import '../model/dm_overlay.dart';
import '../model/draw_stroke.dart';
import '../model/map_library_entry.dart';
import '../model/map_token.dart';
import '../model/raster_grid.dart';
import '../model/session.dart';
import '../model/shared_map.dart';
import '../model/table_fit.dart';
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
import '../storage/map_thumbnails.dart';
import '../storage/tv_calibration_store.dart';
import '../update/deploy_restore.dart';
import '../update/update_service_stub.dart'
    if (dart.library.io) '../update/update_service.dart';
import '../util/file_signatures.dart';
import 'system_bars.dart';

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
  /// Set when the app was relaunched by a rolling deploy (initial route
  /// `/restore`, see [DeployRestore]): the shell reopens the game that was
  /// running before the update. `null` on a normal launch.
  final RestoreTarget? restore;

  /// Creates the TV shell widget; see [restore].
  const TvShell({super.key, this.restore});

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

  /// Focus of the "Take over" button shown after [RelayConnectionState.replaced],
  /// so the remote's select key hits it right away (not the back arrow).
  final FocusNode _takeOverFocus = FocusNode(debugLabel: 'takeOver');

  /// Focus of the back button — where the remote lands in the game view
  /// (see [_setView]). The button stays focusable while it is invisible.
  final FocusNode _backFocus = FocusNode(debugLabel: 'back');

  /// Whether the back arrow is drawn: only for a few seconds after a remote
  /// key press ([_onRemoteKey]), so the table shows nothing but the map.
  bool _showBack = false;
  Timer? _showBackTimer;

  /// The last error the TV reported ([_sendError]), shown in the top-right
  /// badge for a few seconds; null when there is none.
  String? _tvError;
  Timer? _tvErrorTimer;
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
  bool _isImageSession = false;

  /// The open game's maps beyond the one on the table: all its map ids
  /// ([Session.mapIds]) and the parked maps' state ([Session.parkedMaps]),
  /// for the game [_SessionMaps.sessionId]. [_saveCurrentSession] keeps
  /// them only while that game is open, so a new game starts with one map.
  _SessionMaps? _sessionMaps;

  // Rendering spinner (for PDF render, map decode, etc.)
  bool _isRendering = false;
  String _renderingLabel = '';

  // Update state
  double? _updateProgress;
  String _updateStatus = '';

  // Throttled state broadcast
  bool _dirty = false;
  Timer? _broadcastTimer;

  // Auto-save
  Timer? _autoSaveTimer;

  /// Clears the "Updating…" notice if no install follows a
  /// `deploy.prepare` (see [_prepareForDeploy]).
  Timer? _deployNoticeTimer;

  /// Logs an info-level message under the `tv` tag.
  ///
  /// The message goes to:
  /// 1. The local debug console via [debugPrint] (stripped in release).
  /// 2. The VPS log server via [RemoteLog.info].
  /// 3. The companion phone via the relay (best-effort; ignored if the
  ///    relay sink is broken so logging never crashes the app).
  void _log(String msg) {
    debugPrint('TvShell: $msg');
    RemoteLog.info('tv', msg);
    // Also send through relay so we can see it in logs even if RemoteLog is broken
    try {
      _relay.sendRaw(jsonEncode({'type': 'tv.log', 'msg': msg}));
    } catch (_) {
      // Self-protective: never let the logger throw.
    }
  }

  void _setView(TvView view) {
    setState(() => _currentView = view);
    _writeRestoreSnapshot();
    RemoteLog.info('nav', 'View: ${view.name}', {'view': view.name});
    if (view == TvView.game) {
      // The game has no focusable controls; park focus on the back button so
      // the remote's back/select keys keep working.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _backFocus.requestFocus();
      });
    }
  }

  @override
  void initState() {
    super.initState();
    _state.isInteractive = false; // TV has no touch
    _backFocus.addListener(() {
      if (mounted) setState(() {}); // repaint the back arrow's focus look
    });
    HardwareKeyboard.instance.addHandler(_onRemoteKey);
    WakelockPlus.enable(); // Keep TV screen on
    SystemBars.hide(); // no status or navigation bar on the table
    RemoteLog.sendDeviceInfo();
    // The TV's one-inch calibration lives on the TV, not in each game
    TvCalibrationStore.loadWidthInches().then((w) {
      if (mounted) _state.setTvWidthInches(w);
    });
    _library.init().then((_) {
      _log('Library loaded: ${_library.entries.length} maps');
      if (mounted) setState(() {});
      if (widget.restore != null) _restoreAfterDeploy(widget.restore!);
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
    _deployNoticeTimer?.cancel();
    _showBackTimer?.cancel();
    _tvErrorTimer?.cancel();
    HardwareKeyboard.instance.removeHandler(_onRemoteKey);
    _relay.dispose();
    _takeOverFocus.dispose();
    _backFocus.dispose();
    _state.dispose();
    super.dispose();
  }

  // ─── Relay ───────────────────────────────────────────────

  void _connectRelay() {
    _relay = VttRelayClient(role: 'table');
    _relay.onCommand = _handleCommand;
    // A companion took over the slot (tablet replaced the phone): resend.
    _relay.onPeerReconnected = () {
      _log('Companion replaced — resending library and game');
      _sendInitialState();
    };
    _relay.onMapLoaded = _onMapReceived;
    _relay.onTransferProgress = (p) {
      setState(() => _transferProgress = p < 0 ? null : p);
    };
    _relaySub = _relay.stateStream.listen((s) {
      final wasPaired = _relayState == RelayConnectionState.paired;
      setState(() => _relayState = s);

      if (s == RelayConnectionState.replaced) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _takeOverFocus.requestFocus();
        });
      }

      if (s == RelayConnectionState.paired) {
        RemoteLog.info('relay', 'Companion paired', {'state': 'paired'});
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
    stateJson['sessionMapIds'] = _currentMapIds();
    final camera = _game?.getCameraState() ?? {'x': 0.0, 'y': 0.0, 'zoom': 1.0, 'angle': 0.0};
    _relay.sendFullState(stateJson, camera);
  }

  // ─── State changes ──────────────────────────────────────

  void _onStateChanged() {
    setState(() {});
    _scheduleBroadcast();
    _markDirtyForAutoSave();
  }

  /// Marks the state for the next throttled `vtt.fullState` (every 50 ms
  /// while something changed).
  void _scheduleBroadcast() {
    _dirty = true;
    _broadcastTimer ??= Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (_dirty && _relayState == RelayConnectionState.paired) {
        _dirty = false;
        _broadcastFullState();
      }
    });
  }

  /// The TV camera moved (table layout after a map load or resize, zoom,
  /// a shake): the tablet needs the new camera for its players' frame, and
  /// the session should keep it. Before 1.1.9 a camera change without a
  /// state change was never broadcast, so a freshly opened small map showed
  /// no frame on the tablet until the next edit.
  void _onCameraMoved() {
    if (_currentView != TvView.game) return;
    _scheduleBroadcast();
    _markDirtyForAutoSave();
  }

  // ─── Map download from VPS (HTTP) ────────────────────────

  Future<void> _downloadMapFromVps(String url, String displayName) async {
    try {
      _log('Downloading map from VPS: $url');
      _safeSetTransferProgress(0.0);

      final bytes = await httpDownload(url, onProgress: (p) {
        _safeSetTransferProgress(p);
      });
      _safeSetTransferProgress(null);

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
      _safeSetTransferProgress(null);
    }
  }

  /// Updates [_transferProgress] inside `setState` only if this state is
  /// still mounted.
  ///
  /// Used by async download/upload paths so that progress callbacks fired
  /// after the widget unmounts (e.g. during a Phoenix restart) don't throw
  /// or rebuild a disposed tree.
  void _safeSetTransferProgress(double? value) {
    if (!mounted) return;
    setState(() => _transferProgress = value);
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
      _safeSetTransferProgress(0.0);

      final pdfBytes = await httpDownload(url, onProgress: (p) {
        _safeSetTransferProgress(p);
      });
      _safeSetTransferProgress(null);

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
      _ensureGame(); // frames the map on the table itself (table view)

      _activeMapId = entry.id;
      _activeSessionId = const Uuid().v4();
      _activeSessionName = 'Session 1';
      _sessionCreatedAt = DateTime.now();

      _setView(TvView.game);
      _state.removeListener(_onStateChanged); // not twice if a game was open
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
      _safeSetTransferProgress(null);
    }
  }

  // ─── Image download from VPS ─────────────────────────────

  Future<void> _downloadAndLoadImage(
    String url, String displayName, int gridCols, int gridRows, {
    bool? hasOwnGrid,
    RasterGrid? grid,
  }) async {
    if (grid != null) {
      gridCols = grid.cols;
      gridRows = grid.rows;
    }
    try {
      _log('Downloading image from VPS: $url');
      _safeSetTransferProgress(0.0);

      final imageBytes = await httpDownload(url, onProgress: (p) {
        _safeSetTransferProgress(p);
      });
      _safeSetTransferProgress(null);

      if (imageBytes == null) {
        _sendError('Failed to download image from $url');
        return;
      }
      _log('Image download complete: ${imageBytes.length} bytes');

      // Image entries use the user-configured grid fields like PDFs do,
      // but are flagged with isImage so resume can skip PDF rendering.
      final entry = await _library.addMap(
        imageBytes, displayName,
        isImage: true, pdfGridCols: gridCols, pdfGridRows: gridRows,
        rasterGrid: grid,
      );
      entry.vpsUrl = url;
      // From the upload dialog: a picture with its own grid lines gets none
      // of ours (remembered for every game on this map)
      if (hasOwnGrid != null) entry.drawGrid = !hasOwnGrid;
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
        grid: grid,
      );
      _state.showGrid = entry.drawGrid ?? true;
      _ensureGame(); // frames the map on the table itself (table view)

      _activeMapId = entry.id;
      _activeSessionId = const Uuid().v4();
      _activeSessionName = 'Session 1';
      _sessionCreatedAt = DateTime.now();
      _isPdfSession = false;
      _isImageSession = true;

      _setView(TvView.game);
      _state.removeListener(_onStateChanged); // not twice if a game was open
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
    RemoteLog.info(
      'library',
      'Map received: "$name" (${(bytes.length / 1024 / 1024).toStringAsFixed(1)} MB)',
      {'name': name, 'sizeBytes': bytes.length},
    );

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
      {bool sendMapToCompanion = true, SessionSettings? settings}) async {
    try {
      await _flushPendingSave();
      _log('Starting new session: mapId=$mapId, name="$name", sendMap=$sendMapToCompanion');
      final entry = _library.getEntry(mapId);
      final bytes = await _library.loadMapBytes(mapId);
      _log('Map loaded from disk: ${bytes.length} bytes');

      // Check if this is a PDF map — render page to image first
      if (entry?.isPdf == true) {
        setState(() { _isRendering = true; _renderingLabel = 'Rendering PDF...'; });
        _relay.sendRaw(jsonEncode({'type': 'tv.rendering', 'active': true, 'label': 'Rendering PDF...'}));
        final rendered = await PdfHelper.renderPdfPage(bytes);
        if (!mounted) return;
        setState(() { _isRendering = false; });
        _relay.sendRaw(jsonEncode({'type': 'tv.rendering', 'active': false}));
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
          grid: entry.rasterGrid,
        );
      } else if (entry?.isImage == true) {
        // Raw raster image (jpg/png/webp upload) — not UVTT JSON, so
        // loadMap would throw. Same synthetic-map path as _resumeSession.
        final codec = await ui.instantiateImageCodec(bytes);
        final frame = await codec.getNextFrame();
        final width = frame.image.width;
        final height = frame.image.height;
        frame.image.dispose();
        if (!mounted) return;
        _state.loadPdfAsMap(
          bytes,
          gridCols: entry!.pdfGridCols ?? 20,
          gridRows: entry.pdfGridRows ?? 15,
          imageWidth: width.toDouble(),
          imageHeight: height.toDouble(),
          grid: entry.rasterGrid,
        );
      } else {
        _state.loadMap(bytes);
      }
      // Whether battlemap draws its grid is remembered per map
      _state.showGrid = entry?.drawGrid ?? true;
      _ensureGame(); // frames the map on the table itself (table view)

      _activeMapId = mapId;
      _activeSessionId = const Uuid().v4();
      _activeSessionName = name;
      _sessionCreatedAt = DateTime.now();

      _setView(TvView.game);
      _state.removeListener(_onStateChanged); // not twice if a game was open
      _state.addListener(_onStateChanged);

      // Apply session settings if provided
      if (settings != null) {
        _state.sessionSettings = settings;
      }

      // Initial save
      await _saveCurrentSession(
        isPdfSession: entry?.isPdf == true,
        isImageSession: entry?.isImage == true,
      );

      // Tell companion where to download the map (if they don't already have it)
      if (sendMapToCompanion) {
        final isRaster = entry?.isPdf == true || entry?.isImage == true;
        if (isRaster && _state.map?.imageBytes != null) {
          // PDF or image: send the pixels via chunks, like _resumeSession
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
      _sendError('Could not open the map: $e');
      _log('Stack: ${stack.toString().split('\n').take(5).join(' | ')}');
      RemoteLog.error('session', 'startNewSession failed', {'error': '$e', 'mapId': mapId});
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
      await _flushPendingSave();
      _log('Resuming session: $sessionId');
      final session = await _library.loadSession(sessionId);
      if (session == null) {
        _log('ERROR: session not found: $sessionId');
        return;
      }

      final entry = _library.getEntry(session.mapId);
      final bytes = await _library.loadMapBytes(session.mapId);
      _log('Map loaded from disk: ${bytes.length} bytes');

      // Decide what kind of map this is. Schema flags are the source of
      // truth, but legacy entries may have isPdf=true while actually
      // holding image bytes (a bug pre-1.1.2). Sniff the magic bytes as a
      // bulletproof fallback so resuming such sessions still works.
      final claimsImage = session.isImageSession || (entry?.isImage == true);
      final claimsPdf = session.isPdfSession || (entry?.isPdf == true);
      final actuallyPdf = FileSignatures.looksLikePdf(bytes);
      // If something says PDF but the bytes aren't a PDF, treat as image.
      final loadAsImage = claimsImage || (claimsPdf && !actuallyPdf);
      final loadAsPdf = claimsPdf && actuallyPdf;

      if (loadAsPdf) {
        setState(() { _isRendering = true; _renderingLabel = 'Rendering PDF...'; });
        _relay.sendRaw(jsonEncode({'type': 'tv.rendering', 'active': true, 'label': 'Rendering PDF...'}));
        final rendered = await PdfHelper.renderPdfPage(bytes);
        if (!mounted) return;
        setState(() { _isRendering = false; });
        _relay.sendRaw(jsonEncode({'type': 'tv.rendering', 'active': false}));
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
          grid: entry?.rasterGrid,
        );
      } else if (loadAsImage) {
        // Raw raster image — decode for dimensions, then load as a synthetic
        // UVTT map. No PDF rendering required.
        final codec = await ui.instantiateImageCodec(bytes);
        final frame = await codec.getNextFrame();
        if (!mounted) {
          frame.image.dispose();
          return;
        }
        final width = frame.image.width;
        final height = frame.image.height;
        frame.image.dispose();
        final gridCols = entry?.pdfGridCols ?? 20;
        final gridRows = entry?.pdfGridRows ?? 15;
        _log('Image map: ${width}x$height, grid ${gridCols}x$gridRows');
        _state.loadPdfAsMap(
          bytes,
          gridCols: gridCols,
          gridRows: gridRows,
          imageWidth: width.toDouble(),
          imageHeight: height.toDouble(),
          grid: entry?.rasterGrid,
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
      // Table view: mode and window (the scale follows the TV's own
      // calibration; the session's mapFit only records it)
      _state.tvCameraMode = TvCameraMode.fromName(session.tvCameraMode);
      _state.tableCol = session.tableCol;
      _state.tableRow = session.tableRow;

      // Restore tokens and drawings
      _state.tokens = session.tokenData
          .map((t) => MapToken.fromJson(t))
          .toList();
      _state.strokes = session.strokeData
          .map((s) => DrawStroke.fromJson(s))
          .toList();
      _state.drawColor = Color(session.drawColorValue);
      _state.drawWidth = session.drawWidth;
      _state.rulerVisible = session.rulerVisible;
      _state.rulerX = session.rulerX;
      _state.rulerY = session.rulerY;
      _state.rulerRotation = session.rulerRotation;
      _state.dmOverlays =
          session.dmOverlayData.map((o) => DmOverlay.fromJson(o)).toList();
      _state.sessionSettings = session.settings.copy();
      final modeName = session.interactionMode;
      _state.interactionMode = InteractionMode.values.firstWhere(
        (m) => m.name == modeName,
        orElse: () => InteractionMode.fogReveal,
      );

      _activeMapId = session.mapId;
      _activeSessionId = session.id;
      _sessionMaps = _SessionMaps(session.id, session.mapIds, session.parkedMaps);
      _activeSessionName = session.name;
      _sessionCreatedAt = session.createdAt;
      _isPdfSession = loadAsPdf;
      _isImageSession = loadAsImage;

      _setView(TvView.game);
      _state.removeListener(_onStateChanged); // not twice if a game was open
      _state.addListener(_onStateChanged);

      _game!.syncCamera(
          session.cameraX, session.cameraY, session.cameraZoom, session.cameraAngle);

      // Send map to companion so it can display it
      final mapImageBytes = _state.map?.imageBytes;
      _log('Send map: pdf=$loadAsPdf, image=$loadAsImage, hasMap=${_state.map != null}, imageLen=${mapImageBytes?.length ?? 0}');
      if ((loadAsPdf || loadAsImage) && mapImageBytes != null) {
        // PDF (rendered) or raw image: send pixels via chunks. Companion
        // can't render PDFs on web, so we always ship the bitmap.
        _log('Sending image bytes to companion (${(mapImageBytes.length / 1024).round()} KB)');
        _relay.sendMapChunked(mapImageBytes);
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
      } else if (mapImageBytes != null) {
        // Last resort: send image bytes
        _log('No VPS URL or raw bytes, sending image bytes via chunks');
        _relay.sendMapChunked(mapImageBytes);
      }
      _broadcastFullState();
      _log('Session resumed: ${session.name}');
    } catch (e, stack) {
      _log('ERROR in _resumeSession: $e');
      _log('Stack: ${stack.toString().split('\n').take(5).join(' | ')}');
      RemoteLog.error('session', 'resumeSession failed', {'error': '$e', 'sessionId': sessionId});
    }
  }

  /// The open game's map ids, the table's map included — `[]` outside a
  /// game. Sent as `sessionMapIds` in `vtt.fullState` for the companion's
  /// map switcher.
  List<String> _currentMapIds() {
    final active = _activeMapId;
    if (_activeSessionId == null || active == null) return const [];
    final maps = _sessionMaps;
    if (maps == null || maps.sessionId != _activeSessionId) return [active];
    return [...maps.mapIds, if (!maps.mapIds.contains(active)) active];
  }

  /// Puts map [mapId] on the table in the open game (`vtt.switchMap`):
  /// saves the game, parks the current map's fog, tokens and drawings
  /// ([Session.switchTo]) and resumes the game on [mapId] — its own state
  /// back if it was played in this game before, a fresh start otherwise.
  ///
  /// Reports a `tv.error` outside a game or for an unknown map.
  Future<void> _switchMap(String mapId) async {
    final sessionId = _activeSessionId;
    if (_currentView != TvView.game || sessionId == null) {
      _sendError('Switch map: no game is open');
      return;
    }
    if (mapId == _activeMapId) {
      _broadcastFullState();
      return;
    }
    final entry = _library.getEntry(mapId);
    if (entry == null) {
      _sendError('Switch map: this TV has no map $mapId');
      return;
    }
    try {
      _autoSaveTimer?.cancel();
      await _saveCurrentSession();
      final session = await _library.loadSession(sessionId);
      if (session == null) throw StateError('session $sessionId not saved');
      final next = session.switchTo(mapId,
          showGrid: entry.drawGrid ?? true,
          isPdf: entry.isPdf,
          isImage: entry.isImage);
      await _library.saveSession(next);
      RemoteLog.info('session', 'Switch map: "${entry.displayName}"',
          {'session': sessionId, 'mapId': mapId, 'maps': next.mapIds.length});
      await _resumeSession(next.id);
      _sendLibraryListing();
    } catch (e) {
      _sendError('Could not switch the map: $e');
    }
  }

  /// Opens a map from the shared library (`lib.openSharedMap`).
  ///
  /// Reuses the TV's copy when it has one ([MapLibrary.entryForServerMap]);
  /// otherwise downloads [shared] from the VPS (progress on the TV) and adds
  /// it to the library with its kind, squares (placed by its [RasterGrid]
  /// when it has one) and grid choice. Then, with
  /// [intoGame] and a game open, the map joins that game ([_switchMap]);
  /// else a new game named [name] with [settings] starts on it.
  Future<void> _openSharedMap(SharedMap shared,
      {required bool intoGame, String? name, SessionSettings? settings}) async {
    var entry = _library.entryForServerMap(shared.id);
    if (entry == null) {
      final url = '${RelayConfig.httpBase}${shared.url}';
      _log('Shared map "${shared.name}": downloading $url');
      _safeSetTransferProgress(0.0);
      final bytes = await httpDownload(url, onProgress: _safeSetTransferProgress);
      _safeSetTransferProgress(null);
      if (bytes == null) {
        _sendError('Could not download "${shared.name}" from the shared library');
        return;
      }
      try {
        final grid = shared.isImage ? RasterGrid.fromJson(shared.grid) : null;
        entry = await _library.addMap(bytes, shared.name,
            isImage: shared.isImage,
            pdfGridCols: shared.isImage ? grid?.cols ?? shared.gridCols ?? 20 : null,
            pdfGridRows: shared.isImage ? grid?.rows ?? shared.gridRows ?? 15 : null,
            rasterGrid: grid);
      } catch (e) {
        _sendError('"${shared.name}" is not a map battlemap can read: $e');
        return;
      }
      entry.vpsUrl = url;
      entry.serverMapId = shared.id;
      if (shared.isImage) entry.drawGrid = !shared.hasOwnGrid;
      await _library.updateEntry(entry);
      RemoteLog.info('library', 'Shared map added: "${shared.name}"',
          {'serverMapId': shared.id, 'mapId': entry.id, 'sizeBytes': bytes.length});
      _sendLibraryListing();
    }
    if (intoGame && _currentView == TvView.game && _activeSessionId != null) {
      await _switchMap(entry.id);
    } else {
      await _startNewSession(entry.id, name ?? 'Session 1', settings: settings);
    }
  }

  void _ensureGame() {
    _game ??= VttGame(state: _state, tableDisplay: true)
      ..onCameraChanged = (_) => _onCameraMoved();
  }

  /// How the open game's map goes on the table — scale, calibration,
  /// whether we draw a grid ([MapFit]) — for the session file, or `null`
  /// before the TV knows its screen.
  Map<String, dynamic>? _mapFitRecord() {
    final map = _state.map;
    final grid = _game?.tableGrid;
    if (map == null || grid == null) return null;
    return MapFit.of(
      grid,
      cellPx: map.resolution.pixelsPerGrid.toDouble(),
      cols: map.resolution.mapSize.dx.toInt(),
      rows: map.resolution.mapSize.dy.toInt(),
      drawGrid: _state.showGrid,
    ).toJson();
  }

  /// Remembers on the open map's library entry whether battlemap draws its
  /// grid, so the next game on this map starts the same way.
  Future<void> _rememberDrawGrid() async {
    final id = _activeMapId;
    final entry = id == null ? null : _library.getEntry(id);
    if (entry == null || entry.drawGrid == _state.showGrid) return;
    entry.drawGrid = _state.showGrid;
    await _library.updateEntry(entry);
  }

  /// Lays a new grid over the open raster map (`vtt.setMapGrid`): the
  /// library entry keeps it for later games; drawings, tokens and layers
  /// stay, and the fog too when only the squares' size or position changed
  /// ([VttState.regridRaster]). [grid] places the squares exactly; without
  /// it they are stretched over the whole picture.
  Future<void> _setMapGrid(int cols, int rows, {RasterGrid? grid}) async {
    final id = _activeMapId;
    final entry = id == null ? null : _library.getEntry(id);
    if (entry == null || !(entry.isImage || entry.isPdf)) {
      _sendError('Only picture and PDF maps can be re-gridded');
      return;
    }
    if (!_state.regridRaster(cols, rows, grid: grid)) return;
    final applied = _state.rasterGrid;
    await _library.updateEntry(entry.withGrid(applied?.cols ?? cols,
        applied?.rows ?? rows,
        grid: applied == null || applied.isWhole ? null : applied));
    _sendLibraryListing();
    RemoteLog.info('session', 'Map re-gridded: $applied',
        {'cols': applied?.cols ?? cols, 'rows': applied?.rows ?? rows});
  }

  // ─── Auto-save ──────────────────────────────────────────

  void _markDirtyForAutoSave() {
    if (_activeSessionId == null) return;
    _autoSaveTimer?.cancel();
    _autoSaveTimer = Timer(const Duration(seconds: 2), () {
      _saveCurrentSession();
    });
  }

  /// Saves where the TV is (view, map, session) for a rolling deploy's
  /// relaunch ([DeployRestore]). Called on every view change and session
  /// save; cheap (one small Hive entry).
  Future<void> _writeRestoreSnapshot() => DeployRestore.save(
        view: _currentView.name,
        mapId: _currentView == TvView.game ? _activeMapId : null,
        sessionId: _currentView == TvView.game ? _activeSessionId : null,
      );

  /// Reopens the game that ran before a rolling deploy ([TvShell.restore]).
  ///
  /// Uses the session named in the launch route (read by `tools/deploy.sh`
  /// from the old app's `diag.status`) or else the saved snapshot. Shows a
  /// "restoring" overlay meanwhile; with nothing to restore the TV stays on
  /// its start view.
  Future<void> _restoreAfterDeploy(RestoreTarget target) async {
    final t = target.sessionId != null ? target : await DeployRestore.load();
    final sessionId = t?.sessionId;
    if (sessionId == null) {
      RemoteLog.info('restore', 'Deploy restore: no game to reopen');
      return;
    }
    RemoteLog.info('restore', 'Deploy restore: reopening session', {'session': sessionId});
    if (mounted) {
      setState(() {
        _isRendering = true;
        _renderingLabel = 'Updated — reopening the game…';
      });
    }
    try {
      await _resumeSession(sessionId);
    } finally {
      if (mounted) setState(() => _isRendering = false);
    }
  }

  /// Handles `deploy.prepare` (rolling deploy, `tools/deploy.sh`): saves the
  /// session and the restore snapshot right now, shows "Updating…", and
  /// answers `deploy.ready` so the script installs and the companion warns
  /// the DM. The notice clears itself after 60 s if no install follows.
  Future<void> _prepareForDeploy() async {
    setState(() {
      _isRendering = true;
      _renderingLabel = 'Updating battlemap — back in a few seconds';
    });
    _deployNoticeTimer?.cancel();
    _deployNoticeTimer = Timer(const Duration(seconds: 60), () {
      if (mounted) setState(() => _isRendering = false);
    });
    _autoSaveTimer?.cancel();
    if (_currentView == TvView.game) await _saveCurrentSession();
    await _writeRestoreSnapshot();
    RemoteLog.info('restore', 'Deploy prepare: saved', {'view': _currentView.name, 'session': _activeSessionId});
    _relay.sendRaw(jsonEncode({
      'type': 'deploy.ready',
      'view': _currentView.name,
      'mapId': _activeMapId,
      'sessionId': _activeSessionId,
    }));
  }

  /// Saves the current session now if a debounced auto-save is pending.
  ///
  /// Call before the active session changes ([_startNewSession],
  /// [_resumeSession], back to the library). The debounce in
  /// [_markDirtyForAutoSave] would otherwise fire after the switch and save
  /// the *new* session, so edits made in the last 2 s before switching were
  /// lost (found by the bench robot on 2026-10-10: reveal a tower floor,
  /// switch floors right away, come back — fog and tokens gone).
  Future<void> _flushPendingSave() async {
    final timer = _autoSaveTimer;
    if (timer == null || !timer.isActive || _activeSessionId == null) return;
    timer.cancel();
    await _saveCurrentSession();
  }

  /// Saves the current session state to disk.
  ///
  /// Optional [isPdfSession] / [isImageSession] override the cached
  /// `_isPdfSession` / `_isImageSession` flags so that the persisted
  /// session knows whether to render a PDF or load image bytes directly
  /// on resume. The two flags are mutually exclusive — passing one as
  /// `true` does not automatically clear the other, so callers should
  /// supply both when transitioning between modes.
  ///
  /// Called both from the initial session creation and from the 2-second
  /// auto-save timer.
  Future<void> _saveCurrentSession({
    bool? isPdfSession,
    bool? isImageSession,
  }) async {
    if (_activeSessionId == null || _activeMapId == null) return;
    if (isPdfSession != null) _isPdfSession = isPdfSession;
    if (isImageSession != null) _isImageSession = isImageSession;
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
      tvCameraMode: _state.tvCameraMode.name,
      tableCol: _state.tableCol,
      tableRow: _state.tableRow,
      mapFit: _mapFitRecord(),
      tokenData: _state.tokens.map((t) => t.toJson()).toList(),
      strokeData: _state.strokes.map((s) => s.toJson()).toList(),
      drawColorValue: _state.drawColor.toARGB32(),
      drawWidth: _state.drawWidth,
      interactionMode: _state.interactionMode.name,
      rulerVisible: _state.rulerVisible,
      rulerX: _state.rulerX,
      rulerY: _state.rulerY,
      rulerRotation: _state.rulerRotation,
      dmOverlayData: _state.dmOverlays.map((o) => o.toJson()).toList(),
      mapIds: _currentMapIds(),
      parkedMaps: _sessionMaps?.sessionId == _activeSessionId
          ? _sessionMaps!.parked
          : null,
      cameraX: (camera['x'] as num).toDouble(),
      cameraY: (camera['y'] as num).toDouble(),
      cameraZoom: (camera['zoom'] as num).toDouble(),
      cameraAngle: (camera['angle'] as num).toDouble(),
      isPdfSession: _isPdfSession,
      isImageSession: _isImageSession,
      settings: _state.sessionSettings.copy(),
    );
    await _library.saveSession(session);
    await _writeRestoreSnapshot();
    RemoteLog.debug(
      'session',
      'Saved session "${session.name}" (${session.revealedCells.length} cells)',
      {'session': session.name, 'cells': session.revealedCells.length},
    );
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
      'sessionMapIds': _currentMapIds(),
      'hasLoadedMap': _state.map != null,
      'hasGame': _game != null,
      'isPdfSession': _isPdfSession,
      'revealedCells': _state.revealedCells.length,
      'openPortals': _state.openPortals.length,
      'fogEnabled': _state.fogEnabled,
      'showGrid': _state.showGrid,
      'tvWidthInches': _state.tvWidthInches,
      'tvCameraMode': _state.tvCameraMode.name,
      'table': '${_state.tableCols}x${_state.tableRows}',
      'tableWindow': [_state.tableCol, _state.tableRow],
    };
    _relay.sendRaw(jsonEncode(status));
    // Also log it
    RemoteLog.debug('diag', 'Diag status sent', status);
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
        if (!mounted) return;
        setState(() => _updateProgress = p);
        _relay.sendRaw(jsonEncode({
          'type': 'update.progress',
          'progress': p,
          'status': 'Downloading... ${(p * 100).toInt()}%',
        }));
      },
      onStatus: (status) {
        _log('Update status: $status');
        if (!mounted) return;
        setState(() => _updateStatus = status);
        _relay.sendRaw(jsonEncode({
          'type': 'update.progress',
          'progress': _updateProgress ?? 1.0,
          'status': status,
        }));
      },
    );

    if (!mounted) return;
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
    unawaited(_makeMissingThumbnails());
  }

  /// Maps whose thumbnail could not be made — not retried until restart.
  final Set<String> _thumbnailFailed = {};

  /// Whether [_makeMissingThumbnails] is running (one pass at a time).
  bool _thumbnailsRunning = false;

  /// Makes the missing map thumbnails one by one ([MapThumbnails]), stores
  /// them and sends each to the companion (`lib.thumbnail`) as it's ready.
  ///
  /// Runs only while the TV shows the library and stops when a game starts:
  /// reading a big `.dd2vtt` costs memory the game needs on a 2 GB box.
  /// PDF maps get none (they'd need rasterizing). Started after every
  /// library listing; a pass already running is not doubled.
  Future<void> _makeMissingThumbnails() async {
    if (_thumbnailsRunning) return;
    _thumbnailsRunning = true;
    try {
      for (final entry in List.of(_library.entries)) {
        if (!mounted || _currentView != TvView.library) break;
        if (entry.isPdf ||
            _thumbnailFailed.contains(entry.id) ||
            _library.hasThumbnail(entry.id)) {
          continue;
        }
        try {
          final bytes = await _library.loadMapBytes(entry.id);
          final picture =
              await MapThumbnails.mapPicture(bytes, isImage: entry.isImage);
          final png =
              picture == null ? null : await MapThumbnails.encode(picture);
          if (png == null) {
            _thumbnailFailed.add(entry.id);
            continue;
          }
          await _library.saveThumbnail(entry.id, png);
          _sendThumbnail(entry.id, png);
          _log('Thumbnail made for ${entry.displayName} (${png.length ~/ 1024} KB)');
        } catch (e) {
          _thumbnailFailed.add(entry.id);
          _log('Thumbnail failed for ${entry.id}: $e');
        }
      }
    } finally {
      _thumbnailsRunning = false;
    }
  }

  /// Sends the thumbnail [png] of map [mapId] to the companion.
  void _sendThumbnail(String mapId, Uint8List png) {
    _relay.sendRaw(jsonEncode({
      'type': 'lib.thumbnail',
      'mapId': mapId,
      'png': base64Encode(png),
    }));
  }

  // ─── Error reporting ────────────────────────────────────

  /// Reports an error to both the companion phone and the VPS log server.
  ///
  /// Sends a `tv.error` relay message so the companion can surface it in
  /// the dev log, and writes an [LogLevel.error] entry tagged `tv` to the
  /// remote log server. Also echoes locally via [_log].
  /// Shows the back arrow for 5 s after any remote key press, so whoever
  /// picked up the remote sees where focus is. Never consumes the key.
  bool _onRemoteKey(KeyEvent event) {
    if (event is KeyDownEvent && mounted) {
      _showBackTimer?.cancel();
      _showBackTimer = Timer(const Duration(seconds: 5), () {
        if (mounted) setState(() => _showBack = false);
      });
      if (!_showBack) setState(() => _showBack = true);
    }
    return false;
  }

  /// Reports [msg] to the companion (`tv.error`) and the log, and shows it in
  /// the TV's top-right badge for 8 s.
  void _sendError(String msg) {
    _relay.sendRaw(jsonEncode({'type': 'tv.error', 'msg': msg}));
    if (mounted) {
      setState(() => _tvError = msg);
      _tvErrorTimer?.cancel();
      _tvErrorTimer = Timer(const Duration(seconds: 8), () {
        if (mounted) setState(() => _tvError = null);
      });
    }
    debugPrint('TvShell ERROR: $msg');
    RemoteLog.error('tv', msg);
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
          type == 'vtt.setTvCameraMode' || type == 'vtt.setMapGrid' ||
          type == 'vtt.switchMap' ||
          type == 'vtt.pdfUploaded' || type == 'vtt.imageUploaded' ||
          type == 'vtt.updateSessionSettings' ||
          type == 'vtt.triggerEffect') {
        RemoteLog.debug('cmd', 'Command: $type', {'type': type});
      }

      switch (type) {
        // Navigation
        case 'nav.goToLibrary':
          _flushPendingSave();
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
          final settingsJson = msg['settings'] as Map<String, dynamic>?;
          final settings = settingsJson != null
              ? SessionSettings.fromJson(settingsJson)
              : null;
          _startNewSession(mapId, name, settings: settings);

        // Library
        case 'lib.requestList':
          _sendLibraryListing();

        case 'lib.getThumbnail':
          final mapId = msg['mapId'] as String;
          _library.loadThumbnail(mapId).then((png) {
            if (png != null) _sendThumbnail(mapId, png);
          });

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

        // More than one map per game: put another one on the table
        case 'vtt.switchMap':
          final mapId = msg['mapId'] as String?;
          if (mapId == null || mapId.isEmpty) {
            _sendError('vtt.switchMap: missing or empty mapId');
            return;
          }
          _switchMap(mapId);

        // A map from the shared library: into the game, or a new game
        case 'lib.openSharedMap':
          final mapJson = msg['map'];
          if (mapJson is! Map) {
            _sendError('lib.openSharedMap: missing map');
            return;
          }
          final settingsJson = msg['settings'] as Map<String, dynamic>?;
          _openSharedMap(
            SharedMap.fromJson(Map<String, dynamic>.from(mapJson)),
            intoGame: msg['intoGame'] as bool? ?? false,
            name: msg['name'] as String?,
            settings: settingsJson != null
                ? SessionSettings.fromJson(settingsJson)
                : null,
          );

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
            hasOwnGrid: msg['hasGrid'] as bool?,
            grid: RasterGrid.fromJson(msg['grid']),
          );

        // Diagnostics — respond with TV state
        case 'diag.status':
          _sendDiagStatus();

        // Rolling deploy: save now, the new build is about to be installed
        case 'deploy.prepare':
          _prepareForDeploy();

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
        case 'vtt.createToken':
          _state.createToken(name: msg['name'] as String? ?? '');
        case 'vtt.setTokenHidden':
          _state.setTokenHidden(msg['id'] as String, msg['hidden'] as bool? ?? true);
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
          _rememberDrawGrid();
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
        // Table view: the TV's own calibration (kept on the TV's disk)
        case 'vtt.calibrate':
          _state.setTvWidthInches((msg['tvWidthInches'] as num).toDouble());
          TvCalibrationStore.saveWidthInches(_state.tvWidthInches);
          RemoteLog.info('table', 'Calibrated: picture ${_state.tvWidthInches} in wide',
              {'tvWidthInches': _state.tvWidthInches});
        case 'vtt.resetCalibration':
          _state.setTvWidthInches(TableGrid.defaultScreenWidthInches);
          TvCalibrationStore.saveWidthInches(null);
        case 'vtt.showCalibration':
          _state.setShowCalibration(msg['on'] as bool? ?? false);
        case 'vtt.setTvCameraMode':
          switch (TvCameraMode.fromName(msg['mode'] as String?)) {
            case TvCameraMode.table:
              _game?.showTable();
            case TvCameraMode.fit:
              _game?.showWholeMap();
            case TvCameraMode.free:
              _state.setTvCameraMode(TvCameraMode.free);
          }
          _broadcastFullState();
        case 'vtt.panTable':
          _game?.panTable(
            (msg['dx'] as num?)?.toInt() ?? 0,
            (msg['dy'] as num?)?.toInt() ?? 0,
          );
          _broadcastFullState();
        case 'vtt.setTableWindow':
          _game?.setTableWindow(
            (msg['col'] as num?)?.toInt(),
            (msg['row'] as num?)?.toInt(),
          );
          _broadcastFullState();
        case 'vtt.setMapGrid':
          _setMapGrid(
            (msg['cols'] as num).toInt(),
            (msg['rows'] as num).toInt(),
            grid: RasterGrid.fromJson(msg['grid']),
          );
        case 'vtt.setCamera':
          _game?.applyCamera(
            (msg['x'] as num).toDouble(),
            (msg['y'] as num).toDouble(),
            (msg['zoom'] as num).toDouble(),
            (msg['angle'] as num?)?.toDouble() ?? 0,
          );
          _broadcastFullState();
          _markDirtyForAutoSave();

        // Measure line
        case 'vtt.setMeasure':
          if (msg['x1'] != null) {
            _state.setMeasure(
              Offset((msg['x1'] as num).toDouble(), (msg['y1'] as num).toDouble()),
              Offset((msg['x2'] as num).toDouble(), (msg['y2'] as num).toDouble()),
            );
          } else {
            _state.clearMeasure();
          }

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
          switch (msg['circle']) {
            case 'new':
              _state.previewCircle(cells);
            case 'replace':
              _state.previewCircle(cells, replaceLast: true);
            default:
              _state.revealRoom(cells);
          }

        // AoE templates
        case 'vtt.setAoe':
          _state.setAoe(AoeTemplate.fromJson(msg));
        case 'vtt.clearAoe':
          _state.clearAoe();

        // Ruler overlay
        case 'vtt.toggleRuler':
          _state.toggleRuler();
          // Appear where the players look, not at the map's corner
          if (_state.rulerVisible) _game?.centerRulerInView();
        case 'vtt.setRulerPosition':
          _state.setRulerPosition(
            (msg['x'] as num).toDouble(),
            (msg['y'] as num).toDouble(),
          );
        case 'vtt.rotateRuler':
          _state.rotateRulerCW();
        // vtt.setScaleFactor (companions before 1.1.9) is ignored: the TV
        // shows one inch per square, the calibration is vtt.calibrate.

        // DM-only picture layers: stored with the session, never drawn here
        case 'vtt.setDmOverlays':
          _state.setDmOverlaysFromRemote(
            (msg['overlays'] as List? ?? const [])
                .map((o) => DmOverlay.fromJson(Map<String, dynamic>.from(o as Map)))
                .toList(),
            (msg['rev'] as num?)?.toInt() ?? 0,
          );

        // Session settings
        case 'vtt.updateSessionSettings':
          final settingsJson = msg['settings'] as Map<String, dynamic>?;
          if (settingsJson != null) {
            _state.setSessionSettings(SessionSettings.fromJson(settingsJson));
            _broadcastFullState();
            _log('Session settings updated');
          }

        // Global visual effects
        case 'vtt.triggerEffect':
          _game?.triggerEffect(msg['effect'] as String);
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

              // Back button: invisible but focusable, shown for a few
              // seconds after a remote key press (see _onRemoteKey)
              Positioned(
                top: 16,
                left: 16,
                child: AnimatedOpacity(
                  opacity: _showBack ? 1 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: IconButton(
                    autofocus: true,
                    focusNode: _backFocus,
                    icon: Icon(Icons.arrow_back,
                        color: _backFocus.hasFocus ? Colors.white : Colors.white38),
                    onPressed: _navigateBack,
                    // Clearly visible from the couch when the remote lands here.
                    focusColor: Colors.white.withValues(alpha: 0.35),
                  ),
                ),
              ),

              // Problems only (top-right): nothing while all is well
              Positioned(
                top: 16,
                right: 16,
                child: _buildRelayStatus(),
              ),

              // Rendering spinner (hourglass for PDF render, map decode)
              if (_isRendering) _buildRenderingOverlay(),

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

  /// When [_navigateBack] last ran — see the debounce there.
  DateTime _lastBack = DateTime.fromMillisecondsSinceEpoch(0);

  void _navigateBack() {
    // One remote press arrives twice on Android TV: as a key event (the shell's
    // Focus) and as a system back (PopScope). Without this the TV jumped two
    // screens per press (game → library → waiting).
    final now = DateTime.now();
    if (now.difference(_lastBack) < const Duration(milliseconds: 400)) return;
    _lastBack = now;
    _log('navigateBack from ${_currentView.name}');
    if (_currentView == TvView.game) {
      _flushPendingSave();
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
          // autofocus off: with focus, Flame's GameWidget marks every key as
          // handled (the game has no KeyboardEvents), so the TV remote was dead
          // during a game until 2026-10-10.
          return GameWidget(game: _game!, autofocus: false);
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
              RelayConnectionState.replaced =>
                'Another TV took over the relay',
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

  /// Builds the problem badge in the top-right corner — empty while the
  /// companion is paired and no TV error ([_tvError]) is showing.
  ///
  /// A [_tvError] takes the badge for its 8 s; otherwise it shows the relay
  /// trouble. After [RelayConnectionState.replaced] (another TV registered as table)
  /// it adds a focusable "Take over" button — reachable with the remote — that
  /// calls [VttRelayClient.connect] to claim the relay slot back.
  Widget _buildRelayStatus() {
    final error = _tvError;
    if (error != null) return _statusBadge(Icons.error_outline, Colors.redAccent, error);
    final badge = switch (_relayState) {
      RelayConnectionState.connected => _statusBadge(Icons.phonelink_off,
          Colors.orangeAccent, 'Companion not connected'),
      RelayConnectionState.connecting => _statusBadge(Icons.cloud_sync,
          Colors.orangeAccent, 'Connecting to relay...'),
      RelayConnectionState.disconnected => _statusBadge(Icons.cloud_off,
          Colors.redAccent, 'No connection to the relay'),
      RelayConnectionState.replaced => _statusBadge(Icons.swap_horiz,
          Colors.redAccent, 'Another TV took over'),
      RelayConnectionState.paired => const SizedBox.shrink(),
    };
    if (_relayState != RelayConnectionState.replaced) return badge;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        badge,
        const SizedBox(width: 8),
        TextButton(
          focusNode: _takeOverFocus,
          onPressed: _relay.connect,
          style: TextButton.styleFrom(
            foregroundColor: Colors.white,
            backgroundColor: Colors.black54,
          ).copyWith(
            overlayColor: WidgetStatePropertyAll(Colors.white.withValues(alpha: 0.2)),
          ),
          child: const Text('Take over'),
        ),
      ],
    );
  }

  /// One dark pill for the top-right corner: [icon] in [color], then [text].
  Widget _statusBadge(IconData icon, Color color, String text) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 480),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 13,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRenderingOverlay() {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: const Color(0xEE1a1512),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF5a4a30)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(
                color: Color(0xFFd4a76a),
                strokeWidth: 3,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              _renderingLabel,
              style: const TextStyle(
                color: Color(0xFFd4a76a),
                fontSize: 16,
              ),
            ),
          ],
        ),
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

/// The maps of one open game beyond the table's: [mapIds] in the order
/// they joined and the [parked] ones' state ([Session.parkedMaps]).
class _SessionMaps {
  /// The game these maps belong to ([Session.id]).
  final String sessionId;

  /// Every map of the game ([Session.mapIds]).
  final List<String> mapIds;

  /// The state of each map not on the table, by map id.
  final Map<String, Map<String, dynamic>> parked;

  _SessionMaps(this.sessionId, this.mapIds, this.parked);
}
