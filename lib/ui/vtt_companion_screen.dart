import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/foundation.dart' show Uint8List;
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../network/http_upload_stub.dart'
    if (dart.library.html) '../network/http_upload.dart';
import '../network/file_picker_options_stub.dart'
    if (dart.library.js_interop) '../network/file_picker_options_web.dart';
import '../network/relay_config.dart';
import '../pdf_helper.dart';

import '../game/dm_overlay_images.dart';
import '../game/vtt_game.dart';
import '../model/dm_overlay.dart';
import '../model/map_library_entry.dart';
import '../model/session.dart';
import '../network/vtt_relay_client.dart';
import '../state/vtt_state.dart';
import 'dev_log.dart';
import 'dm_control_panel.dart';
import 'session_settings_dialog.dart';

/// Companion Mode screen — the DM's phone-based control surface.
///
/// Connects to the VPS relay as a `"companion"` role and mirrors the
/// TV's game state in a local [VttGame] preview. All map loading, fog
/// reveal, token placement, drawing, camera control, and navigation
/// are routed through the [VttRelayClient] so they execute on the TV.
///
/// Supports two modes:
/// - **Networked** (default) — connects to the relay; UI adapts to
///   the TV's current view (waiting, library, or game).
/// - **Local** ([localMode] = `true`) — runs standalone without any
///   relay connection, acting directly on a local [VttState].
///
/// The screen hosts a [DmControlPanel] for DM actions and shows an
/// adaptive UI: a waiting screen, a library browser, or the Flame
/// game preview with overlay controls.
///
/// See also:
/// - [TvShell], the TV-side counterpart.
/// - [VttRelayClient], the networking layer.
/// - [DmControlPanel], the control panel widget.
class VttCompanionScreen extends StatefulWidget {
  /// When `true`, runs without a relay connection for local testing.
  ///
  /// All actions apply directly to a local [VttState] instead of
  /// being sent over the network.
  final bool localMode;

  /// Creates the companion screen.
  ///
  /// Set [localMode] to `true` for standalone operation without a TV.
  const VttCompanionScreen({
    super.key,
    this.localMode = false,
  });

  @override
  State<VttCompanionScreen> createState() => _VttCompanionScreenState();
}

class _VttCompanionScreenState extends State<VttCompanionScreen> {
  final VttState _state = VttState();
  late final VttGame _game;

  /// Pictures of the DM-only layers — this device downloads and draws
  /// them, the TV never does.
  final DmOverlayImages _overlayImages =
      DmOverlayImages(download: (url) => httpDownloadWeb(url));

  /// Progress of a running layer upload (`null` = none), and its label.
  double? _overlayUploadProgress;
  String? _overlayUploadLabel;

  VttRelayClient? _relay;
  RelayConnectionState _relayState = RelayConnectionState.disconnected;
  StreamSubscription<RelayConnectionState>? _relaySub;
  double? _transferProgress;
  bool _tvRendering = false;
  String _tvRenderingLabel = '';

  // TV view state (received from TV via fullState)
  String _tvView = 'waiting';

  // Library data (received from TV)
  List<MapLibraryEntry> _maps = [];
  List<Session> _sessions = [];

  // Update state
  Map<String, dynamic>? _updateInfo;
  double? _updateDownloadProgress;
  String? _updateDownloadStatus;

  // Session loading progress
  String? _loadingSessionId;

  // Debounce: prevents double-tap on session/map loading
  bool _isLoading = false;
  Timer? _loadingTimeout;

  // Camera link: TV follows the phone camera (throttled vtt.setCamera)
  bool _cameraLinked = false;
  Timer? _cameraSendTimer;
  CameraSnapshot? _pendingCamera;

  /// Minimum interval between two `vtt.setCamera` messages while linked.
  static const Duration _cameraSendInterval = Duration(milliseconds: 80);

  bool get _isNetworked => !widget.localMode;

  @override
  void initState() {
    super.initState();
    _state.isInteractive = true;
    // Networked: the phone camera is free (no calibration clamp) and shows
    // the TV's viewport as an outline. Local mode: the phone *is* the display.
    _game = VttGame(
      state: _state,
      isDisplay: widget.localMode,
      dmOverlayImages: _overlayImages,
    );
    _state.addListener(_onStateChanged);
    _overlayImages.addListener(_onOverlayImagesChanged);
    if (_isNetworked) _connectRelay();
  }

  @override
  void dispose() {
    _loadingTimeout?.cancel();
    _cameraSendTimer?.cancel();
    _state.removeListener(_onStateChanged);
    _overlayImages.removeListener(_onOverlayImagesChanged);
    _relaySub?.cancel();
    _relay?.dispose();
    _state.dispose();
    _overlayImages.dispose();
    super.dispose();
  }

  void _onStateChanged() {
    _overlayImages.sync(_state.dmOverlays, enabled: _state.showDmOverlays);
    setState(() {});
  }

  /// A layer picture finished loading (or failed) — refresh the Layers tab.
  void _onOverlayImagesChanged() {
    if (mounted) setState(() {});
  }

  /// Shows a floating [SnackBar] with the given [msg].
  ///
  /// Optionally accepts a background [color] (defaults to `Colors.white24`).
  void _showSnack(String msg, {Color? color}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: color ?? Colors.white24,
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  /// Confirms a one-tap bulk action (reveal all, hide all, clear drawings)
  /// with a snackbar offering Undo.
  ///
  /// [changed] is whether the action did anything; [staged] whether it only
  /// staged fog in shadow mode (nothing reached the players, nothing to
  /// undo — the snackbar points at the apply button). [onUndo] undoes the
  /// action (`vtt.undo` on the TV, or the local undo).
  ///
  /// See also: [_buildCallbacks], which wraps the panel's bulk buttons.
  void _confirmBulk(String done, {
    required bool changed,
    bool staged = false,
    required VoidCallback onUndo,
  }) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(staged
            ? '$done in the preview — tap ✓ to show the players'
            : changed
                ? done
                : 'Nothing changed'),
        backgroundColor: Colors.white24,
        duration: Duration(seconds: changed && !staged ? 5 : 2),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        action: changed && !staged
            ? SnackBarAction(label: 'Undo', onPressed: onUndo)
            : null,
      ),
    );
  }

  /// Number of fog cells of the loaded map (0 without a map).
  int get _totalCells {
    final map = _state.map;
    if (map == null) return 0;
    return map.resolution.mapSize.dx.toInt() * map.resolution.mapSize.dy.toInt();
  }

  /// Marks a loading action as started and arms a 30-second timeout.
  ///
  /// Returns `false` if another action is already in progress (double-tap
  /// guard). The caller should abort when `false` is returned.
  bool _beginLoading() {
    if (_isLoading) return false;
    _isLoading = true;
    _loadingTimeout?.cancel();
    _loadingTimeout = Timer(const Duration(seconds: 30), () {
      _isLoading = false;
    });
    return true;
  }

  /// Clears the loading guard so the next action can proceed.
  void _endLoading() {
    _isLoading = false;
    _loadingTimeout?.cancel();
  }

  /// Shows the session settings dialog, then creates a new session
  /// with the chosen settings.
  ///
  /// If the user cancels the dialog, no session is created.
  Future<void> _startNewSessionWithSettings(String mapId, String name) async {
    final settings = await showSessionSettingsDialog(context);
    if (settings == null) return; // cancelled
    if (!_beginLoading()) return;
    _showSnack('Loading session...');
    _relay?.sendNewSession(mapId, name: name, settings: settings.toJson());
  }

  /// The TV's most recent `vtt.fullState`, re-applied in [_onMapReady]
  /// because loading a map resets the state the TV already sent.
  Map<String, dynamic>? _lastFullState;

  void _connectRelay() {
    _relay = VttRelayClient(role: 'companion');
    DevLog.add('Companion: connecting to relay');
    _relay!.onStateSync = (msg) {
      _lastFullState = msg;
      try {
        _state.applyRemoteState(msg);
      } catch (e) {
        DevLog.add('ERROR: state sync failed: $e');
        return;
      }
      // Extract TV view state
      final view = msg['tvView'] as String?;
      if (!mounted) return;
      if (view != null) {
        if (view == 'game' && _state.map == null) {
          // TV is in game view but we don't have the map yet.
          // Show library so user can see sessions and progress.
          _loadingSessionId ??= msg['activeSessionId'] as String?;
          setState(() => _tvView = 'library');
        } else {
          if (view == 'game') {
            _loadingSessionId = null;
            _endLoading();
          }
          setState(() => _tvView = view);
        }
      }
    };
    _relay!.onCameraSync = (x, y, zoom, angle, vw, vh) {
      // The phone camera stays independent; the TV view is drawn as a frame.
      _game.setTvViewport(CameraSnapshot(
          x: x, y: y, zoom: zoom, angle: angle, vw: vw, vh: vh));
    };
    _game.onCameraChanged = (snap) {
      if (!_cameraLinked) return;
      _queueCameraSend(snap);
    };
    _relay!.onMapLoaded = (bytes) {
      DevLog.add('Companion: map received via chunks (${(bytes.length / 1024).round()} KB)');
      try {
        _state.loadMap(bytes); // Try UVTT first
      } catch (e) {
        // Not valid UVTT — treat as raw image (rendered PDF or image map).
        // Use grid info from the TV's last fullState if available.
        DevLog.add('Companion: not UVTT (parse: $e), trying as image');
        final gridCols = _state.map?.resolution.mapSize.dx.toInt() ?? 20;
        final gridRows = _state.map?.resolution.mapSize.dy.toInt() ?? 15;
        DevLog.add('Companion: not UVTT, loading as image (${gridCols}x$gridRows grid)');
        // Decode image to get dimensions
        ui.instantiateImageCodec(bytes).then((codec) async {
          final frame = await codec.getNextFrame();
          final w = frame.image.width.toDouble();
          final h = frame.image.height.toDouble();
          frame.image.dispose();
          _state.loadPdfAsMap(bytes,
            gridCols: gridCols, gridRows: gridRows,
            imageWidth: w, imageHeight: h,
          );
          _onMapReady();
        }).catchError((e) {
          DevLog.add('Companion: image decode failed: $e');
        });
        return; // _onMapReady called in the then() above
      }
      _onMapReady();
    };
    _relay!.onMapDownloadUrl = (url, name) {
      DevLog.add('Companion: downloading map "$name" from VPS');
      _downloadMapFromVps(url);
    };
    _relay!.onTransferProgress = (p) {
      if (!mounted) return;
      setState(() => _transferProgress = p < 0 ? null : p);
    };
    _relay!.onLibraryListing = (listing) {
      final mapCount = (listing['maps'] as List).length;
      final sessionCount = (listing['sessions'] as List).length;
      DevLog.add('Companion: library listing ($mapCount maps, $sessionCount sessions)');
      if (!mounted) return;
      setState(() {
        _maps = (listing['maps'] as List)
            .map((e) => MapLibraryEntry.fromJson(e as Map<String, dynamic>))
            .toList();
        _sessions = (listing['sessions'] as List)
            .map((e) => Session.fromJson(e as Map<String, dynamic>))
            .toList();
      });
    };
    _relay!.onUpdateVersionInfo = (info) {
      DevLog.add('Companion: update version info received');
      if (!mounted) return;
      setState(() => _updateInfo = info);
      _showUpdateDialog();
    };
    _relay!.onUpdateProgress = (progress, status) {
      if (!mounted) return;
      setState(() {
        _updateDownloadProgress = progress;
        _updateDownloadStatus = status;
      });
      // Clear progress after install or error
      if (status.startsWith('Install') || status.startsWith('Error')) {
        Future.delayed(const Duration(seconds: 5), () {
          if (mounted) {
            setState(() {
              _updateDownloadProgress = null;
              _updateDownloadStatus = null;
            });
          }
        });
      }
    };
    _relay!.onTvLog = (msg) => DevLog.add('[TV] $msg');
    _relay!.onTvRendering = (active, label) {
      if (mounted) setState(() { _tvRendering = active; _tvRenderingLabel = label; });
    };
    _relay!.onTvError = (msg) {
      DevLog.add('TV ERROR: $msg');
      // A failed command must not leave the double-tap guard armed.
      _endLoading();
      if (mounted) setState(() => _loadingSessionId = null);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('TV: $msg'),
            backgroundColor: Colors.redAccent,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    };
    _state.onBrushPaint = (indices) => _relay!.sendBrushReveal(indices);
    _state.onPortalTap = (index) => _relay!.sendTogglePortal(index);
    _state.onTokenAdded = (token) => _relay!.sendAddToken(token.gridX, token.gridY);
    _state.onTokenRemoved = (id) => _relay!.sendRemoveToken(id);
    _state.onTokenMoved = (id, x, y) => _relay!.sendMoveToken(id, x, y);
    _state.onTokenEdited = (id, name, maxHp, currentHp, conditions) =>
        _relay!.sendEditToken(id,
            name: name, maxHp: maxHp, currentHp: currentHp, conditions: conditions);
    _state.onStrokeAdded = (stroke) => _relay!.sendAddStroke(stroke.toJson());
    _state.onDrawingsCleared = () => _relay!.sendClearDrawings();
    _state.onLiveStrokeChanged = (stroke) => _relay!.sendStrokeUpdate(stroke?.toJson());
    _state.onMeasureChanged = (start, end) => _relay!.sendSetMeasure(start, end);
    _state.onAoeChanged = (t) =>
        t == null ? _relay!.sendClearAoe() : _relay!.sendSetAoe(t.toJson());
    _state.onRulerMoved = (x, y) => _relay!.sendSetRulerPosition(x, y);
    _state.onDmOverlaysChanged = (overlays, rev) => _relay!
        .sendSetDmOverlays(overlays.map((o) => o.toJson()).toList(), rev);
    _relaySub = _relay!.stateStream.listen((s) {
      if (s == RelayConnectionState.paired) {
        DevLog.add('Companion: paired with TV');
      } else if (s == RelayConnectionState.disconnected) {
        DevLog.add('Companion: relay disconnected');
      } else if (s == RelayConnectionState.connected) {
        DevLog.add('Companion: relay connected, waiting for TV');
      } else if (s == RelayConnectionState.replaced) {
        DevLog.add('Companion: another companion took over the relay');
      }
      if (!mounted) return;
      setState(() => _relayState = s);
      if (s == RelayConnectionState.replaced) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('Another phone took over the TV'),
          duration: const Duration(days: 1),
          action: SnackBarAction(label: 'Reconnect', onPressed: _relay!.connect),
        ));
      } else {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
      }
    });
    _relay!.connect();
  }

  /// Forwards the phone camera to the TV, at most once per
  /// [_cameraSendInterval]; the latest snapshot wins when throttled.
  void _queueCameraSend(CameraSnapshot snap) {
    if (_cameraSendTimer != null) {
      _pendingCamera = snap;
      return;
    }
    _relay?.sendSetCamera(snap.toJson());
    _cameraSendTimer = Timer(_cameraSendInterval, () {
      _cameraSendTimer = null;
      final pending = _pendingCamera;
      _pendingCamera = null;
      if (pending != null && _cameraLinked) _queueCameraSend(pending);
    });
  }

  /// Called when the map has been loaded (via chunks or HTTP download).
  /// Switches from library to game view if the TV is already in game mode.
  void _onMapReady() {
    if (!mounted) return;
    // Loading the map reset fog, doors and tokens to the file's defaults; the
    // TV's state usually arrived *before* the download finished, so apply it
    // again (before 2026-10-10 the tablet showed everything fogged after a
    // reconnect or resume until some unrelated change).
    final last = _lastFullState;
    if (last != null) {
      try {
        _state.applyRemoteState(last);
      } catch (e) {
        DevLog.add('ERROR: re-applying state after map load failed: $e');
      }
    }
    _loadingSessionId = null;
    // If TV is in game view, switch companion to game view now
    setState(() => _tvView = 'game');
  }

  Future<void> _downloadMapFromVps(String url) async {
    try {
      if (mounted) setState(() => _transferProgress = 0.0);
      DevLog.add('Companion: downloading map from $url');
      final bytes = await httpDownloadWeb(url, onProgress: (p) {
        if (mounted) setState(() => _transferProgress = p);
      });
      if (mounted) setState(() => _transferProgress = null);
      if (bytes != null) {
        DevLog.add('Companion: map downloaded (${(bytes.length / 1024).round()} KB)');
        _state.loadMap(bytes);
        _onMapReady();
      } else {
        DevLog.add('Companion: map download failed');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text("Couldn't download the TV's map — check the connection"),
          ));
        }
      }
    } catch (e) {
      DevLog.add('Companion: map download error: $e');
      if (mounted) setState(() => _transferProgress = null);
    }
  }

  /// Opens a file picker for `.dd2vtt`/`.uvtt`, image, or `.pdf` files and
  /// uploads the map to the VPS.
  ///
  /// For UVTT files: loads locally for immediate preview and sends a
  /// `vtt.mapUploaded` command so the TV downloads and processes the map.
  ///
  /// For images and PDFs: shows a grid configuration dialog first (no
  /// embedded grid metadata), then uploads and sends `vtt.imageUploaded`.
  /// **PDFs are rasterized here on the phone** ([PdfHelper.renderPdfPage],
  /// pdfrx's PDFium WASM build, first page, ≤ 4096 px) and uploaded as a PNG
  /// named `<file>.png` — the TV only ever receives an image map, so it needs
  /// no PDF engine (Apple TV has none; `docs/apple-tv-dev.md`). The legacy
  /// `vtt.pdfUploaded` path on the TV stays for older phone builds.
  ///
  /// See also:
  /// - [_showPdfGridDialog], which collects grid dimensions for PDF/image maps.
  /// - [TvShell._downloadAndLoadImage], the TV-side handler.
  Future<void> _pickAndUploadMap() async {
    // Use FileType.any because Safari doesn't recognize .dd2vtt/.uvtt extensions
    // webFilePickerOptions: keep the pick alive while iOS Safari shows the
    // Files sheet (the plugin default cancels it on window focus).
    final file = await FilePicker.pickFile(
      type: FileType.any,
      webOptions: webFilePickerOptions(),
    );
    if (file == null) {
      DevLog.add('Companion: file picker cancelled');
      return;
    }
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      DevLog.add('Companion: file picker returned no data for "${file.name}"');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not read file. Try downloading it to your phone first, then pick from local storage.'),
            backgroundColor: Colors.redAccent,
            duration: Duration(seconds: 5),
          ),
        );
      }
      return;
    }

    final nameLower = file.name.toLowerCase();
    final isPdf = nameLower.endsWith('.pdf');
    final isImage = nameLower.endsWith('.png') || nameLower.endsWith('.jpg') ||
        nameLower.endsWith('.jpeg') || nameLower.endsWith('.webp');
    final isVtt = nameLower.endsWith('.dd2vtt') || nameLower.endsWith('.uvtt');
    final needsGridConfig = isPdf || isImage;

    if (!isPdf && !isImage && !isVtt) {
      DevLog.add('Companion: unsupported file type: ${file.name}');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Unsupported file. Use .dd2vtt, .uvtt, .pdf, .png, .jpg, or .webp files.'),
            backgroundColor: Colors.orangeAccent,
            duration: Duration(seconds: 4),
          ),
        );
      }
      return;
    }

    // For PDFs and images, show grid config dialog (no embedded grid metadata)
    ({int cols, int rows})? gridConfig;
    if (needsGridConfig) {
      gridConfig = await _showPdfGridDialog();
      if (gridConfig == null) return; // user cancelled
    }

    if (!_beginLoading()) return;

    // PDF: rasterize on the phone (roadmap #36). The TV never sees a PDF.
    Uint8List uploadBytes = bytes;
    String uploadName = file.name;
    if (isPdf) {
      _showSnack('Rendering PDF page 1...');
      if (mounted) setState(() => _transferProgress = null);
      final rendered = await PdfHelper.renderPdfPage(bytes);
      if (rendered == null) {
        DevLog.add('Companion: PDF render failed for "${file.name}"');
        _showSnack('Could not render this PDF', color: Colors.redAccent);
        _endLoading();
        return;
      }
      uploadBytes = rendered['imageBytes'] as Uint8List;
      uploadName = '${file.name.substring(0, file.name.length - 4)}.png';
      DevLog.add('Companion: PDF rendered to ${rendered['width']}x${rendered['height']} '
          'PNG (${(uploadBytes.length / 1024).round()} KB, '
          '${rendered['pageCount']} page(s), using page 1)');
    }

    _showSnack('Uploading map...');
    DevLog.add('Companion: uploading ${isPdf ? "rasterized PDF" : isImage ? "image" : "map"} '
        '"$uploadName" (${(uploadBytes.length / 1024).round()} KB)');

    // For UVTT files, load locally for immediate preview.
    // For PDFs/images, don't load locally — the TV handles rendering.
    if (isVtt) {
      _state.loadMap(bytes);
    }

    if (_isNetworked && _relay != null) {
      // Upload to VPS via HTTP, then tell TV to download
      if (mounted) setState(() => _transferProgress = 0.01);
      try {
        final uploadUrl = '${RelayConfig.httpBase}/upload/${Uri.encodeComponent(uploadName)}';
        DevLog.add('Companion: uploading to $uploadUrl');
        final resp = await httpUpload(uploadUrl, uploadBytes, onProgress: (p) {
          if (mounted) setState(() => _transferProgress = p);
        });
        if (resp != null) {
          final downloadUrl = '${RelayConfig.httpBase}${resp['url']}';
          DevLog.add('Companion: upload done, telling TV to download');
          _showSnack('Map uploaded');
          if (needsGridConfig) {
            // Image (or PDF rendered to PNG above): send with grid config
            _relay!.sendRaw(jsonEncode({
              'type': 'vtt.imageUploaded',
              'url': downloadUrl,
              'displayName': uploadName,
              'gridCols': gridConfig!.cols,
              'gridRows': gridConfig.rows,
            }));
          } else {
            // UVTT: send mapUploaded
            _relay!.sendRaw(jsonEncode({
              'type': 'vtt.mapUploaded',
              'url': downloadUrl,
              'displayName': file.name,
            }));
          }
        } else {
          DevLog.add('Companion: HTTP upload failed');
          _showSnack('Upload failed', color: Colors.redAccent);
          _endLoading();
        }
      } catch (e) {
        DevLog.add('Companion: upload error: $e');
        _showSnack('Upload failed', color: Colors.redAccent);
        _endLoading();
      }
      if (mounted) setState(() => _transferProgress = null);
    }
  }

  /// Lets the DM pick one or more pictures (PNG/JPG/WebP, or a PDF whose
  /// first page is rasterized like a map PDF) and adds each as a DM-only
  /// layer on top of the stack.
  ///
  /// Networked: each file is HTTP-PUT to `/upload/dm/<name>` on the VPS
  /// (the dev server keeps `dm/` uploads, no 7-day cleanup) and the layer
  /// list goes to the TV with the session ([VttState.onDmOverlaysChanged] →
  /// `vtt.setDmOverlays`); the TV stores it but never loads the pictures.
  /// Local mode: nothing is uploaded, the layer lives in memory
  /// (`local:<id>` URL). The picked bytes seed [_overlayImages], so a layer
  /// shows at once without downloading what was just uploaded.
  ///
  /// Shows progress in the Layers tab and a snackbar with the result;
  /// unsupported or unreadable files are skipped and counted.
  ///
  /// See also:
  /// - [DmOverlay], the layer model.
  /// - [DmControlPanel], whose Layers tab edits the layers.
  Future<void> _pickAndAddDmOverlays() async {
    if (_overlayUploadProgress != null) return; // upload already running
    final files = await FilePicker.pickFiles(
      type: FileType.any,
      webOptions: webFilePickerOptions(),
    );
    if (files.isEmpty) return;
    setState(() {
      _overlayUploadProgress = 0;
      _overlayUploadLabel = 'Preparing ${files.length == 1 ? files.first.name : '${files.length} pictures'}…';
    });
    var added = 0;
    final skipped = <String>[];
    for (int i = 0; i < files.length; i++) {
      final file = files[i];
      final step = files.length == 1 ? '' : ' ${i + 1} of ${files.length}';
      void progress(double p, String label) {
        if (!mounted) return;
        setState(() {
          _overlayUploadProgress = (i + p) / files.length;
          _overlayUploadLabel = label;
        });
      }

      try {
        var bytes = await file.readAsBytes();
        var name = file.name;
        final lower = name.toLowerCase();
        final isPdf = lower.endsWith('.pdf');
        final isImage = lower.endsWith('.png') || lower.endsWith('.jpg') ||
            lower.endsWith('.jpeg') || lower.endsWith('.webp');
        if (bytes.isEmpty || (!isPdf && !isImage)) {
          DevLog.add('Companion: DM layer skipped "$name" '
              '(${bytes.isEmpty ? 'empty' : 'unsupported type'})');
          skipped.add(name);
          continue;
        }
        if (isPdf) {
          progress(0, 'Rendering PDF$step…');
          final rendered = await PdfHelper.renderPdfPage(bytes);
          if (rendered == null) {
            DevLog.add('Companion: DM layer PDF render failed for "$name"');
            skipped.add(name);
            continue;
          }
          bytes = rendered['imageBytes'] as Uint8List;
          name = '${name.substring(0, name.length - 4)}.png';
        }

        final id = const Uuid().v4();
        String url;
        if (_isNetworked) {
          progress(0, 'Uploading$step: $name');
          final uploadUrl =
              '${RelayConfig.httpBase}/upload/dm/${Uri.encodeComponent(name)}';
          final resp = await httpUpload(uploadUrl, bytes,
              onProgress: (p) => progress(p, 'Uploading$step: $name'));
          if (resp == null) {
            DevLog.add('Companion: DM layer upload failed for "$name"');
            skipped.add(name);
            continue;
          }
          url = '${RelayConfig.httpBase}${resp['url']}';
        } else {
          url = 'local:$id';
        }
        DevLog.add('Companion: DM layer "$name" added '
            '(${(bytes.length / 1024).round()} KB, $url)');
        // put + add in one synchronous step: sync() keeps only listed ids.
        _overlayImages.put(id, bytes);
        _state.addDmOverlays([DmOverlay(id: id, name: name, url: url)]);
        added++;
      } catch (e) {
        DevLog.add('Companion: DM layer "${file.name}" failed: $e');
        skipped.add(file.name);
      }
    }
    if (!mounted) return;
    setState(() {
      _overlayUploadProgress = null;
      _overlayUploadLabel = null;
    });
    if (skipped.isEmpty) {
      _showSnack(added == 1 ? 'Layer added — only you see it' : '$added layers added — only you see them');
    } else {
      _showSnack(
        '${added > 0 ? '$added added, ' : ''}${skipped.length} skipped: ${skipped.join(', ')}',
        color: Colors.orangeAccent,
      );
    }
  }

  /// Shows a dialog for configuring grid dimensions when uploading a PDF map.
  ///
  /// PDFs have no embedded grid metadata (unlike `.dd2vtt` files), so the DM
  /// must specify how many grid columns and rows the map should have. Provides
  /// preset buttons for common sizes (20x15, 30x20, 40x30) and text fields
  /// for custom values.
  ///
  /// Returns `({int cols, int rows})` if the user confirms, or `null` if
  /// they cancel.
  ///
  /// See also:
  /// - [_pickAndUploadMap], which calls this for PDF files.
  Future<({int cols, int rows})?> _showPdfGridDialog() async {
    final colsController = TextEditingController(text: '20');
    final rowsController = TextEditingController(text: '15');
    try {
      return await showDialog<({int cols, int rows})>(
        context: context,
        builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          void setPreset(int cols, int rows) {
            setDialogState(() {
              colsController.text = cols.toString();
              rowsController.text = rows.toString();
            });
          }

          return AlertDialog(
            backgroundColor: const Color(0xFF1A1A2E),
            title: const Text('PDF Grid Configuration'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'PDFs have no grid data. Set the number of grid squares:',
                  style: TextStyle(color: Colors.white54, fontSize: 13),
                ),
                const SizedBox(height: 16),
                // Preset buttons
                Row(
                  children: [
                    _gridPresetButton('20x15', () => setPreset(20, 15)),
                    const SizedBox(width: 8),
                    _gridPresetButton('30x20', () => setPreset(30, 20)),
                    const SizedBox(width: 8),
                    _gridPresetButton('40x30', () => setPreset(40, 30)),
                  ],
                ),
                const SizedBox(height: 16),
                // Custom input
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: colsController,
                        keyboardType: TextInputType.number,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Columns',
                          labelStyle: TextStyle(color: Colors.white38),
                          enabledBorder: UnderlineInputBorder(
                            borderSide: BorderSide(color: Colors.white24),
                          ),
                          focusedBorder: UnderlineInputBorder(
                            borderSide: BorderSide(color: Colors.greenAccent),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    const Text('x', style: TextStyle(color: Colors.white38, fontSize: 16)),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: rowsController,
                        keyboardType: TextInputType.number,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Rows',
                          labelStyle: TextStyle(color: Colors.white38),
                          enabledBorder: UnderlineInputBorder(
                            borderSide: BorderSide(color: Colors.white24),
                          ),
                          focusedBorder: UnderlineInputBorder(
                            borderSide: BorderSide(color: Colors.greenAccent),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () {
                  final cols = int.tryParse(colsController.text) ?? 20;
                  final rows = int.tryParse(rowsController.text) ?? 15;
                  Navigator.pop(ctx, (cols: cols.clamp(1, 200), rows: rows.clamp(1, 200)));
                },
                child: const Text('Upload'),
              ),
            ],
          );
        },
      ),
    );
    } finally {
      colsController.dispose();
      rowsController.dispose();
    }
  }

  /// Builds a small preset button for the grid config dialog.
  Widget _gridPresetButton(String label, VoidCallback onTap) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.white54,
        side: const BorderSide(color: Colors.white24),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }

  DmCallbacks _buildCallbacks() {
    if (_isNetworked && _relay != null) {
      final c = _relay!;
      return DmCallbacks(
        onLoadMap: _pickAndUploadMap,
        onToggleFog: c.sendToggleFog,
        // Bulk actions: decided from the TV's mirrored state, before sending
        onRevealAll: () {
          final changed = _state.revealedCells.length < _totalCells;
          c.sendRevealAll();
          _confirmBulk('Whole map revealed',
              changed: changed, staged: _state.shadowMode, onUndo: c.sendUndo);
        },
        onHideAll: () {
          final changed = _state.revealedCells.isNotEmpty;
          c.sendHideAll();
          _confirmBulk('Whole map hidden',
              changed: changed, staged: _state.shadowMode, onUndo: c.sendUndo);
        },
        onToggleGrid: c.sendToggleGrid,
        onToggleWalls: c.sendToggleWalls,
        onToggleRevealMode: c.sendToggleRevealMode,
        onSetBrushRadius: c.sendSetBrushRadius,
        onZoomIn: c.sendZoomIn,
        onZoomOut: c.sendZoomOut,
        onZoomToFit: c.sendZoomToFit,
        onRotateCW: c.sendRotateCW,
        onRotateCCW: c.sendRotateCCW,
        onResetRotation: c.sendResetRotation,
        onCalibrate: c.sendCalibrate,
        onResetCalibration: c.sendResetCalibration,
        onSetFogMode: () => c.sendSetInteractionMode('fogReveal'),
        onSetDrawMode: () => c.sendSetInteractionMode('draw'),
        onSetTokenMode: () => c.sendSetInteractionMode('token'),
        onSetDrawColor: (color) => c.sendSetDrawColor(color.toARGB32()),
        onSetDrawWidth: (width) => c.sendSetDrawWidth(width),
        onClearDrawings: () {
          final changed = _state.strokes.isNotEmpty;
          c.sendClearDrawings();
          _confirmBulk('Drawings cleared', changed: changed, onUndo: c.sendUndo);
        },
        onUndoStroke: c.sendUndoStroke,
        onClearTokens: c.sendClearTokens,
        onEditToken: (id, {name, maxHp, currentHp, conditions}) =>
            c.sendEditToken(id,
                name: name ?? '',
                maxHp: maxHp ?? 0,
                currentHp: currentHp ?? 0,
                conditions: conditions?.toList() ?? []),
        onRemoveToken: (id) {
          c.sendRemoveToken(id);
          _showSnack('Token removed');
        },
        onSetMeasureMode: () => c.sendSetInteractionMode('measure'),
        // Undo / Redo
        onUndo: c.sendUndo,
        onRedo: c.sendRedo,
        // Shadow mode
        onToggleShadowMode: c.sendToggleShadowMode,
        onCommitShadow: () {
          c.sendCommitShadow();
          _showSnack('Fog changes applied');
        },
        onClearShadow: () {
          c.sendClearShadow();
          _showSnack('Shadow cleared');
        },
        // Room reveal
        onSetRoomRevealMode: c.sendSetRoomRevealMode,
        onRoomReveal: (cells) => c.sendRoomReveal(cells),
        // AoE
        onSetAoeMode: c.sendSetAoeMode,
        onSetAoe: (t) => c.sendSetAoe(t.toJson()),
        // Clear locally too — onAoeChanged forwards the clear to the TV.
        onClearAoe: _state.clearAoe,
        // Ruler
        onToggleRuler: c.sendToggleRuler,
        onRotateRuler: c.sendRotateRuler,
        onSetScaleFactor: (f) => c.sendSetScaleFactor(f),
        // Session settings
        onUpdateSessionSettings: (settings) =>
            c.sendUpdateSessionSettings(settings.toJson()),
        // Global effects — also play locally so the phone gives feedback
        onTriggerEffect: (effect) {
          c.sendTriggerEffect(effect);
          _game.triggerEffect(effect);
        },
        // Camera link
        onSetCameraLink: (linked) {
          _cameraLinked = linked;
          if (linked) _queueCameraSend(_game.cameraSnapshot);
          _showSnack(linked ? 'TV follows the phone' : 'TV camera unlinked');
        },
        onSendView: () {
          c.sendSetCamera(_game.getCameraState());
          _showSnack('View sent to TV');
        },
        onMatchTv: () {
          if (_game.tvCamera == null) {
            _showSnack('No TV view received yet', color: Colors.orangeAccent);
            return;
          }
          _game.matchTvCamera();
        },
        onPhoneZoomToFit: _game.zoomToFit,
        onAddDmOverlays: _pickAndAddDmOverlays,
      );
    }
    return DmCallbacks(
      onLoadMap: _pickAndUploadMap,
      onToggleFog: _state.toggleFog,
      onRevealAll: () {
        if (_state.map == null) return;
        final changed = _state.revealedCells.length < _totalCells;
        final staged = _state.shadowMode;
        _state.revealAll(_totalCells);
        _confirmBulk('Whole map revealed',
            changed: changed, staged: staged, onUndo: _state.undo);
      },
      onHideAll: () {
        final changed = _state.revealedCells.isNotEmpty;
        final staged = _state.shadowMode;
        _state.hideAll();
        _confirmBulk('Whole map hidden',
            changed: changed, staged: staged, onUndo: _state.undo);
      },
      onToggleGrid: _state.toggleGrid,
      onToggleWalls: _state.toggleWalls,
      onToggleRevealMode: _state.toggleRevealMode,
      onSetBrushRadius: _state.setBrushRadius,
      onZoomIn: _game.zoomIn,
      onZoomOut: _game.zoomOut,
      onZoomToFit: _game.zoomToFit,
      onRotateCW: _game.rotateCW,
      onRotateCCW: _game.rotateCCW,
      onResetRotation: _game.resetRotation,
      onCalibrate: (inches) {
        final screenWidth = MediaQuery.of(context).size.width;
        _state.calibrate(inches, screenWidth);
      },
      onResetCalibration: _state.resetCalibration,
      onSetFogMode: () => _state.setInteractionMode(InteractionMode.fogReveal),
      onSetDrawMode: () => _state.setInteractionMode(InteractionMode.draw),
      onSetTokenMode: () => _state.setInteractionMode(InteractionMode.token),
      onSetDrawColor: (color) => _state.setDrawColor(color),
      onSetDrawWidth: (width) => _state.setDrawWidth(width),
      onClearDrawings: () {
        final changed = _state.strokes.isNotEmpty;
        _state.clearDrawings();
        _confirmBulk('Drawings cleared', changed: changed, onUndo: _state.undo);
      },
      onUndoStroke: _state.undoStroke,
      onClearTokens: _state.clearTokens,
      onEditToken: (id, {name, maxHp, currentHp, conditions}) =>
          _state.editToken(id,
              name: name, maxHp: maxHp, currentHp: currentHp, conditions: conditions),
      onRemoveToken: _state.removeToken,
      onSetMeasureMode: () => _state.setInteractionMode(InteractionMode.measure),
      // Undo / Redo
      onUndo: _state.undo,
      onRedo: _state.redo,
      // Shadow mode
      onToggleShadowMode: _state.toggleShadowMode,
      onCommitShadow: _state.commitShadow,
      onClearShadow: _state.clearShadow,
      // Room reveal
      onSetRoomRevealMode: () => _state.setInteractionMode(InteractionMode.roomReveal),
      onRoomReveal: (cells) => _state.revealRoom(cells.toSet()),
      // AoE
      onSetAoeMode: () => _state.setInteractionMode(InteractionMode.aoe),
      onSetAoe: (t) => _state.setAoe(t),
      onClearAoe: _state.clearAoe,
      // Ruler
      onToggleRuler: () {
        _state.toggleRuler();
        if (_state.rulerVisible) _game.centerRulerInView();
      },
      onRotateRuler: _state.rotateRulerCW,
      onSetScaleFactor: _state.setScaleFactor,
      // Session settings
      onUpdateSessionSettings: _state.setSessionSettings,
      // Global effects
      onTriggerEffect: (effect) => _game.triggerEffect(effect),
      onAddDmOverlays: _pickAndAddDmOverlays,
    );
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_isNetworked && _tvView == 'library') {
      body = _buildLibraryUI();
    } else if (_isNetworked && _tvView == 'waiting') {
      body = _buildWaitingUI();
    } else {
      body = _buildGameUI();
    }

    // Overlay rendering spinner when TV is doing heavy work
    if (_tvRendering) {
      body = Stack(
        children: [
          body,
          Center(
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xEE1a1512),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF5a4a30)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(
                    width: 36,
                    height: 36,
                    child: CircularProgressIndicator(
                      color: Color(0xFFd4a76a),
                      strokeWidth: 3,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _tvRenderingLabel,
                    style: const TextStyle(
                      color: Color(0xFFd4a76a),
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return body;
  }

  // ─── Waiting UI ─────────────────────────────────────────

  Widget _buildWaitingUI() {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A2E),
      body: Stack(
        children: [
          // Back to the mode selector — the only way out while connecting
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white54),
                tooltip: 'Back',
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ),
          Center(
            child: _buildWaitingBody(),
          ),
        ],
      ),
    );
  }

  Widget _buildWaitingBody() {
    return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _relayState == RelayConnectionState.paired
                  ? Icons.check_circle
                  : Icons.cloud_sync,
              color: _relayState == RelayConnectionState.paired
                  ? Colors.greenAccent
                  : Colors.white24,
              size: 48,
            ),
            const SizedBox(height: 16),
            Text(
              switch (_relayState) {
                RelayConnectionState.paired => 'Connected to TV',
                RelayConnectionState.connected => 'Waiting for the TV...',
                RelayConnectionState.replaced => 'Another phone took over the TV',
                _ => 'Connecting...',
              },
              style: const TextStyle(color: Colors.white38, fontSize: 18),
            ),
            if (_relayState == RelayConnectionState.replaced) ...[
              const SizedBox(height: 16),
              FilledButton(
                autofocus: true,
                onPressed: _relay!.connect,
                child: const Text('Reconnect'),
              ),
            ],
          ],
        );
  }

  // ─── Library UI ─────────────────────────────────────────

  Widget _buildLibraryUI() {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A2E),
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white54),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Map Library',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.system_update, color: Colors.white54, size: 22),
                    tooltip: 'Check for Update',
                    onPressed: () {
                      _relay?.sendCheckUpdate();
                    },
                  ),
                  _buildConnectionDot(),
                ],
              ),
            ),

            // Upload button
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Upload Map / PDF'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white.withValues(alpha: 0.1),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: _pickAndUploadMap,
                ),
              ),
            ),

            // Transfer progress
            if (_transferProgress != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: LinearProgressIndicator(
                  value: _transferProgress,
                  backgroundColor: Colors.white12,
                  color: Colors.greenAccent,
                  minHeight: 3,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

            // Update download progress
            if (_updateDownloadProgress != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LinearProgressIndicator(
                      value: _updateDownloadProgress,
                      backgroundColor: Colors.white12,
                      color: Colors.blueAccent,
                      minHeight: 3,
                      borderRadius: BorderRadius.circular(2),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _updateDownloadStatus ?? 'Updating TV...',
                      style: const TextStyle(color: Colors.white38, fontSize: 11),
                    ),
                  ],
                ),
              ),

            // Map list
            Expanded(
              child: _maps.isEmpty
                  ? const Center(
                      child: Text(
                        'No maps yet\nUpload a .dd2vtt or .pdf file to get started',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white24, fontSize: 14),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _maps.length,
                      itemBuilder: (context, index) =>
                          _buildMapListItem(_maps[index]),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMapListItem(MapLibraryEntry entry) {
    final mapSessions =
        _sessions.where((s) => s.mapId == entry.id).toList();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Map header — tap to start new session
          GestureDetector(
            onTap: () => _startNewSessionWithSettings(
                entry.id, 'Session ${mapSessions.length + 1}'),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  Icon(
                    entry.isPdf ? Icons.picture_as_pdf : Icons.map,
                    color: entry.isPdf ? Colors.redAccent.withValues(alpha: 0.5) : Colors.white24,
                    size: 24,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entry.displayName,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          entry.isPdf
                              ? '${entry.gridCols}x${entry.gridRows}  •  PDF  •  '
                                '${(entry.fileSizeBytes / 1024 / 1024).toStringAsFixed(1)} MB'
                              : '${entry.gridCols}x${entry.gridRows}  •  '
                                '${entry.portalCount} doors  •  '
                                '${(entry.fileSizeBytes / 1024 / 1024).toStringAsFixed(1)} MB',
                          style: const TextStyle(
                            color: Colors.white30,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // New session button
                  IconButton(
                    icon: const Icon(Icons.play_circle_outline,
                        color: Colors.greenAccent, size: 24),
                    tooltip: 'New Session',
                    onPressed: () => _startNewSessionWithSettings(
                        entry.id, 'Session ${mapSessions.length + 1}'),
                  ),
                  // Delete button
                  IconButton(
                    icon: const Icon(Icons.delete_outline,
                        color: Colors.redAccent, size: 20),
                    tooltip: 'Delete Map',
                    onPressed: () => _confirmDeleteMap(entry),
                  ),
                ],
              ),
            ),
          ),

          // Sessions for this map
          if (mapSessions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                children: mapSessions
                    .map((s) => _buildSessionRow(s))
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSessionRow(Session session) {
    final ago = _timeAgo(session.lastModifiedAt);
    final isLoading = _loadingSessionId == session.id;
    final progress = isLoading ? (_transferProgress ?? 0.0) : 0.0;

    return GestureDetector(
      onTap: () {
        if (!_beginLoading()) return;
        _showSnack('Loading session...');
        if (mounted) setState(() => _loadingSessionId = session.id);
        _relay?.sendGoToGame(session.mapId, sessionId: session.id);
      },
      child: Container(
        margin: const EdgeInsets.only(top: 6),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Stack(
          children: [
            // Progress fill (left to right)
            if (isLoading)
              Positioned.fill(
                child: FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: progress.clamp(0.0, 1.0),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.greenAccent.withValues(alpha: 0.15),
                    ),
                  ),
                ),
              ),
            // Content
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Icon(
                    isLoading ? Icons.downloading : Icons.play_arrow,
                    color: Colors.greenAccent,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      session.name,
                      style: const TextStyle(color: Colors.white54, fontSize: 13),
                    ),
                  ),
                  Text(
                    isLoading ? '${(progress * 100).toInt()}%' : ago,
                    style: const TextStyle(color: Colors.white24, fontSize: 11),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    icon: const Icon(Icons.delete_outline, color: Colors.white38, size: 20),
                    tooltip: 'Delete session',
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                    onPressed: () => _confirmDeleteSession(session),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDeleteSession(Session session) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('Delete Session?'),
        content: Text(
          'Delete "${session.name}"? Fog, tokens and drawings of this session are lost.',
          style: const TextStyle(color: Colors.white54),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _relay?.sendDeleteSession(session.id);
              _showSnack('Session deleted');
            },
            child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteMap(MapLibraryEntry entry) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('Delete Map?'),
        content: Text(
          'Delete "${entry.displayName}" and all its sessions?',
          style: const TextStyle(color: Colors.white54),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _relay?.sendDeleteMap(entry.id);
              _showSnack('Map deleted');
            },
            child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
  }

  // ─── Update ────────────────────────────────────────────

  void _showUpdateDialog() {
    if (_updateInfo == null || !mounted) return;
    final info = _updateInfo!;
    final error = info['error'] as String?;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('App Update'),
        content: error != null
            ? Text(error, style: const TextStyle(color: Colors.redAccent))
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'TV version: ${info['currentVersion'] ?? 'unknown'}',
                    style: const TextStyle(color: Colors.white54, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Available: ${info['availableVersion'] ?? 'unknown'}',
                    style: const TextStyle(color: Colors.white54, fontSize: 14),
                  ),
                  const SizedBox(height: 12),
                  if (info['hasUpdate'] == true)
                    const Text(
                      'Update available!\n'
                      'Shorebird patches are applied automatically.\n'
                      'Restart the TV app to apply.',
                      style: TextStyle(color: Colors.greenAccent, fontSize: 14),
                    )
                  else
                    const Text(
                      'TV is up to date.',
                      style: TextStyle(color: Colors.white38, fontSize: 14),
                    ),
                ],
              ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
          // Restart TV to apply Shorebird patch
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              DevLog.add('Companion: restarting TV to apply patch');
              _relay?.sendPatchRestart();
            },
            child: const Text('Restart TV'),
          ),
          // Fallback: APK download (for native changes)
          if (error == null && info['hasUpdate'] == true)
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                _relay?.sendStartUpdate();
                if (mounted) {
                  setState(() {
                    _updateDownloadProgress = 0.0;
                    _updateDownloadStatus = 'Downloading APK...';
                  });
                }
              },
              child: const Text('Download APK', style: TextStyle(color: Colors.white38)),
            ),
        ],
      ),
    );
  }

  // ─── Game UI ────────────────────────────────────────────

  /// Game view: the map fills the space above the DM panel, which sits at
  /// the bottom edge as a sheet (tab bar always visible, content on demand).
  Widget _buildGameUI() {
    return Scaffold(
      backgroundColor: const Color(0xFF111111),
      body: Column(
        children: [
          Expanded(child: _buildMapArea()),
          DmControlPanel(
            state: _state,
            callbacks: _buildCallbacks(),
            dmOverlayImages: _overlayImages,
            dmOverlayUploadProgress: _overlayUploadProgress,
            dmOverlayUploadLabel: _overlayUploadLabel,
          ),
        ],
      ),
    );
  }

  Widget _buildMapArea() {
    return Stack(
        children: [
          GameWidget(game: _game),

          // Back / Library button
          Positioned(
            top: 16,
            left: 16,
            child: IconButton(
              icon: Icon(
                _isNetworked ? Icons.grid_view : Icons.arrow_back,
                color: Colors.white54,
              ),
              onPressed: () {
                if (_isNetworked) {
                  DevLog.add('Companion: nav.goToLibrary');
                  _relay?.sendGoToLibrary();
                } else {
                  Navigator.pop(context);
                }
              },
            ),
          ),

          // Connection dot
          if (_isNetworked)
            Positioned(
              top: 24,
              left: 56,
              child: _buildConnectionDot(),
            ),

          // Map info
          if (_state.map != null)
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${_state.map!.resolution.mapSize.dx.toInt()}x'
                  '${_state.map!.resolution.mapSize.dy.toInt()} grid',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ),

          // Empty state (local mode only)
          if (_state.map == null && !_isNetworked)
            const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.map, color: Colors.white12, size: 64),
                  SizedBox(height: 16),
                  Text(
                    'Settings tab → Load Map (.dd2vtt, image or PDF)',
                    style: TextStyle(color: Colors.white24, fontSize: 16),
                  ),
                ],
              ),
            ),
        ],
    );
  }

  // ─── Shared widgets ─────────────────────────────────────

  Widget _buildConnectionDot() {
    Color dotColor;
    switch (_relayState) {
      case RelayConnectionState.paired:
        dotColor = Colors.greenAccent;
      case RelayConnectionState.connected:
      case RelayConnectionState.connecting:
        dotColor = Colors.orangeAccent;
      case RelayConnectionState.disconnected:
      case RelayConnectionState.replaced:
        dotColor = Colors.redAccent;
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: dotColor,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 4),
        Icon(Icons.wifi, color: dotColor.withValues(alpha: 0.7), size: 14),
      ],
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${dt.month}/${dt.day}';
  }
}
