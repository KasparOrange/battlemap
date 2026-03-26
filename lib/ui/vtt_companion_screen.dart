import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/material.dart';

import '../network/http_upload_stub.dart'
    if (dart.library.html) '../network/http_upload.dart';
import '../network/relay_config.dart';

import '../game/vtt_game.dart';
import '../model/map_library_entry.dart';
import '../model/session.dart';
import '../network/vtt_relay_client.dart';
import '../state/vtt_state.dart';
import 'dev_log.dart';
import 'dm_control_panel.dart';

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

  VttRelayClient? _relay;
  RelayConnectionState _relayState = RelayConnectionState.disconnected;
  StreamSubscription<RelayConnectionState>? _relaySub;
  double? _transferProgress;

  // TV view state (received from TV via fullState)
  String _tvView = 'waiting';
  String? _activeMapId;
  String? _activeSessionId;

  // Library data (received from TV)
  List<MapLibraryEntry> _maps = [];
  List<Session> _sessions = [];

  // Update state
  Map<String, dynamic>? _updateInfo;
  double? _updateDownloadProgress;
  String? _updateDownloadStatus;

  // Session loading progress
  String? _loadingSessionId;

  bool get _isNetworked => !widget.localMode;

  @override
  void initState() {
    super.initState();
    _state.isInteractive = true;
    _game = VttGame(state: _state);
    _state.addListener(_onStateChanged);
    if (_isNetworked) _connectRelay();
  }

  @override
  void dispose() {
    _state.removeListener(_onStateChanged);
    _relaySub?.cancel();
    _relay?.dispose();
    _state.dispose();
    super.dispose();
  }

  void _onStateChanged() => setState(() {});

  void _connectRelay() {
    _relay = VttRelayClient(role: 'companion');
    DevLog.add('Companion: connecting to relay');
    _relay!.onStateSync = (msg) {
      try {
        _state.applyRemoteState(msg);
      } catch (e) {
        DevLog.add('ERROR: state sync failed: $e');
        return;
      }
      // Extract TV view state
      final view = msg['tvView'] as String?;
      if (!mounted) return;
      if (view != null && view != _tvView) {
        // Clear loading state when TV switches to game view
        if (view == 'game') {
          _loadingSessionId = null;
        }
        setState(() => _tvView = view);
      }
      setState(() {
        _activeMapId = msg['activeMapId'] as String?;
        _activeSessionId = msg['activeSessionId'] as String?;
      });
    };
    _relay!.onCameraSync = (x, y, zoom, angle) {
      _game.syncCamera(x, y, zoom, angle);
    };
    _relay!.onMapLoaded = (bytes) {
      DevLog.add('Companion: map received via chunks (${(bytes.length / 1024).round()} KB)');
      _state.loadMap(bytes);
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
    _relay!.onTvError = (msg) {
      DevLog.add('TV ERROR: $msg');
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
    _state.onStrokeAdded = (stroke) => _relay!.sendAddStroke(stroke.toJson());
    _state.onDrawingsCleared = () => _relay!.sendClearDrawings();
    _state.onLiveStrokeChanged = (stroke) => _relay!.sendStrokeUpdate(stroke?.toJson());
    _relaySub = _relay!.stateStream.listen((s) {
      if (s == RelayConnectionState.paired) {
        DevLog.add('Companion: paired with TV');
      } else if (s == RelayConnectionState.disconnected) {
        DevLog.add('Companion: relay disconnected');
      } else if (s == RelayConnectionState.connected) {
        DevLog.add('Companion: relay connected, waiting for TV');
      }
      if (!mounted) return;
      setState(() => _relayState = s);
    });
    _relay!.connect();
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
      } else {
        DevLog.add('Companion: map download failed');
      }
    } catch (e) {
      DevLog.add('Companion: map download error: $e');
      if (mounted) setState(() => _transferProgress = null);
    }
  }

  Future<void> _pickAndUploadMap() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['dd2vtt', 'uvtt'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final bytes = file.bytes;
    if (bytes == null) return;

    DevLog.add('Companion: uploading map "${file.name}" (${(bytes.length / 1024).round()} KB)');
    // Load locally for immediate preview
    _state.loadMap(bytes);

    if (_isNetworked && _relay != null) {
      // Upload to VPS via HTTP, then tell TV to download
      if (mounted) setState(() => _transferProgress = 0.01);
      try {
        final uploadUrl = 'http://${RelayConfig.host}:4242/upload/${Uri.encodeComponent(file.name)}';
        DevLog.add('Companion: uploading to $uploadUrl');
        final resp = await httpUpload(uploadUrl, bytes, onProgress: (p) {
          if (mounted) setState(() => _transferProgress = p);
        });
        if (resp != null) {
          final downloadUrl = 'http://${RelayConfig.host}:4242${resp['url']}';
          DevLog.add('Companion: upload done, telling TV to download');
          _relay!.sendRaw(jsonEncode({
            'type': 'vtt.mapUploaded',
            'url': downloadUrl,
            'displayName': file.name,
          }));
        } else {
          DevLog.add('Companion: HTTP upload failed');
        }
      } catch (e) {
        DevLog.add('Companion: upload error: $e');
      }
      if (mounted) setState(() => _transferProgress = null);
    }
  }

  DmCallbacks _buildCallbacks() {
    if (_isNetworked && _relay != null) {
      final c = _relay!;
      return DmCallbacks(
        onLoadMap: _pickAndUploadMap,
        onToggleFog: c.sendToggleFog,
        onRevealAll: c.sendRevealAll,
        onHideAll: c.sendHideAll,
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
        onClearDrawings: c.sendClearDrawings,
        onUndoStroke: c.sendUndoStroke,
        onClearTokens: c.sendClearTokens,
      );
    }
    return DmCallbacks(
      onLoadMap: _pickAndUploadMap,
      onToggleFog: _state.toggleFog,
      onRevealAll: () {
        if (_state.map != null) {
          final total = _state.map!.resolution.mapSize.dx.toInt() *
              _state.map!.resolution.mapSize.dy.toInt();
          _state.revealAll(total);
        }
      },
      onHideAll: _state.hideAll,
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
      onClearDrawings: _state.clearDrawings,
      onUndoStroke: _state.undoStroke,
      onClearTokens: _state.clearTokens,
    );
  }

  @override
  Widget build(BuildContext context) {
    // In networked mode, show adaptive UI based on TV view
    if (_isNetworked && _tvView == 'library') {
      return _buildLibraryUI();
    }
    if (_isNetworked && _tvView == 'waiting') {
      return _buildWaitingUI();
    }

    // Game view (or local mode)
    return _buildGameUI();
  }

  // ─── Waiting UI ─────────────────────────────────────────

  Widget _buildWaitingUI() {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A2E),
      body: Center(
        child: Column(
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
              _relayState == RelayConnectionState.paired
                  ? 'Connected to TV'
                  : 'Connecting...',
              style: const TextStyle(color: Colors.white38, fontSize: 18),
            ),
          ],
        ),
      ),
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
                  label: const Text('Upload Map'),
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
                        'No maps yet\nUpload a .dd2vtt file to get started',
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
            onTap: () {
              _relay?.sendNewSession(entry.id,
                  name: 'Session ${mapSessions.length + 1}');
            },
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  const Icon(Icons.map, color: Colors.white24, size: 24),
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
                          '${entry.gridCols}x${entry.gridRows}  •  '
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
                    onPressed: () {
                      _relay?.sendNewSession(entry.id,
                          name: 'Session ${mapSessions.length + 1}');
                    },
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
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => _relay?.sendDeleteSession(session.id),
                    child: const Icon(Icons.close, color: Colors.white24, size: 16),
                  ),
                ],
              ),
            ),
          ],
        ),
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

  Widget _buildGameUI() {
    return Scaffold(
      body: Stack(
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

          // Transfer progress
          if (_transferProgress != null)
            Positioned(
              top: 16,
              left: 80,
              right: 80,
              child: LinearProgressIndicator(
                value: _transferProgress,
                backgroundColor: Colors.white12,
                color: Colors.greenAccent,
                minHeight: 3,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

          // DM Control Panel
          Positioned(
            bottom: 16,
            right: 16,
            child: DmControlPanel(
              state: _state,
              callbacks: _buildCallbacks(),
            ),
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
                    'Tap the gear icon to load a .dd2vtt map',
                    style: TextStyle(color: Colors.white24, fontSize: 16),
                  ),
                ],
              ),
            ),
        ],
      ),
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
