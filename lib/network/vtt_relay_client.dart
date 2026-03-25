import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'relay_config.dart';

/// Connection lifecycle states for the [VttRelayClient].
///
/// The client progresses through these states as it connects to the
/// VPS relay and waits for its peer (table or companion) to join.
enum RelayConnectionState {
  /// Not connected to the relay server.
  disconnected,

  /// TCP/WebSocket connection in progress but not yet registered.
  connecting,

  /// Registered with the relay, waiting for the peer to connect.
  connected,

  /// Both table and companion are connected and messages flow freely.
  paired,
}

/// Unified WebSocket client that connects to the VPS relay server.
///
/// Works on both web (Safari) and native (APK) platforms via the
/// `web_socket_channel` package. Each client registers with a [role]
/// ("table" or "companion") and the relay pairs one table with one
/// companion, forwarding JSON messages between them.
///
/// Key features:
/// - **Automatic reconnection** with exponential backoff (1 s, 3 s, 10 s,
///   30 s, 60 s) after disconnects or send failures.
/// - **Heartbeat** — sends a `ping` every 15 seconds and forces a reconnect
///   if no data arrives within 30 seconds.
/// - **Chunked map transfer** — large binary map files are base64-encoded,
///   split into 500 KB chunks, and sent as a sequence of `vtt.mapStart`,
///   `vtt.mapChunk`, and `vtt.mapEnd` messages.
/// - **Connection state stream** — listeners can observe
///   [RelayConnectionState] transitions via [stateStream].
///
/// See also:
/// - [RelayConfig], which defines the relay server address.
/// - [TvShell], the table-side consumer.
/// - [VttCompanionScreen], the companion-side consumer.
class VttRelayClient {
  /// Role this client registers as — either `"table"` or `"companion"`.
  final String role;

  /// Hostname or IP of the VPS relay server.
  ///
  /// Defaults to [RelayConfig.host].
  final String host;

  /// Port of the VPS relay server.
  ///
  /// Defaults to [RelayConfig.port].
  final int port;

  /// Called when a command message is received (table side only).
  ///
  /// The companion sends commands like `vtt.toggleFog`, `nav.goToLibrary`,
  /// etc. Any message type not handled internally by this client is
  /// forwarded here.
  void Function(Map<String, dynamic> msg)? onCommand;

  /// Called when a `vtt.fullState` message is received (companion side only).
  ///
  /// Contains the complete serialised [VttState] plus TV view metadata so
  /// the companion can mirror what the TV is showing.
  void Function(Map<String, dynamic> msg)? onStateSync;

  /// Called when camera state is received as part of a `vtt.fullState`
  /// (companion side only).
  ///
  /// Parameters are the camera's world-space [x], [y], [zoom] level, and
  /// rotation [angle] in radians.
  void Function(double x, double y, double zoom, double angle)? onCameraSync;

  /// Called when a chunked map transfer completes (either side).
  ///
  /// The [bytes] contain the raw `.dd2vtt` / `.uvtt` file data
  /// reassembled from the base64 chunks.
  void Function(Uint8List bytes)? onMapLoaded;

  /// Called as map transfer progress changes.
  ///
  /// Values range from `0.0` (just started) to `1.0` (complete).
  /// A value of `-1` signals that the transfer has finished.
  void Function(double progress)? onTransferProgress;

  /// Called when a `lib.listing` message arrives (companion side).
  ///
  /// Contains the TV's map library index including available maps and
  /// saved sessions.
  void Function(Map<String, dynamic> listing)? onLibraryListing;

  /// Called when the TV instructs the companion to download a map via HTTP.
  ///
  /// The [url] points to the map file on the VPS dev server, and
  /// [displayName] is the human-readable file name.
  void Function(String url, String displayName)? onMapDownloadUrl;

  /// Called when `update.versionInfo` arrives (companion side).
  ///
  /// Contains version comparison data so the companion can prompt the
  /// user to update the TV APK.
  void Function(Map<String, dynamic> info)? onUpdateVersionInfo;

  /// Called when `update.progress` arrives (companion side).
  ///
  /// Reports [progress] (0.0 to 1.0) and a human-readable [status]
  /// string describing the current update step.
  void Function(double progress, String status)? onUpdateProgress;

  /// Called when a `tv.log` message arrives (companion side).
  ///
  /// Carries a debug log line from the TV for display in [DevLog].
  void Function(String msg)? onTvLog;

  /// Called when a `tv.error` message arrives (companion side).
  ///
  /// Carries an error description from the TV, typically shown as a
  /// snackbar on the companion UI.
  void Function(String msg)? onTvError;

  /// Called when Shorebird patch status is received (companion side).
  void Function(Map<String, dynamic> status)? onPatchStatus;

  /// Called when Shorebird patch download progress/completion is received.
  void Function(Map<String, dynamic> progress)? onPatchProgress;

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  bool _intentionalClose = false;

  // Heartbeat tracking
  DateTime _lastDataReceived = DateTime.now();
  static const Duration _pingInterval = Duration(seconds: 15);
  static const Duration _pongTimeout = Duration(seconds: 30);

  // Reconnection backoff
  int _reconnectAttempt = 0;
  static const List<int> _backoffSeconds = [1, 3, 10, 30, 60];

  // Send failure tracking
  int _consecutiveSendFailures = 0;
  static const int _maxSendFailures = 5;

  // Chunked map transfer receive buffer
  List<String>? _mapChunks;
  int _mapChunksReceived = 0;

  /// Display name extracted from the most recent `vtt.mapStart` message.
  ///
  /// Used to label the map in the library when a chunked transfer completes.
  String? lastMapDisplayName;

  // Transfer progress (0.0 to 1.0, null = no transfer)
  double? _transferProgress;

  /// Current map transfer progress, or `null` if no transfer is active.
  ///
  /// Ranges from `0.0` (starting) to `1.0` (all chunks sent/received).
  double? get transferProgress => _transferProgress;

  /// Current connection state.
  RelayConnectionState _state = RelayConnectionState.disconnected;

  /// The current [RelayConnectionState] of this client.
  RelayConnectionState get connectionState => _state;

  final _stateController = StreamController<RelayConnectionState>.broadcast();

  /// A broadcast stream that emits whenever [connectionState] changes.
  ///
  /// Useful for driving UI indicators (connection dots, status labels).
  Stream<RelayConnectionState> get stateStream => _stateController.stream;

  /// Chunk size for map transfers (500 KB of base64 data per message).
  static const int _chunkSize = 500 * 1024;

  /// Creates a relay client for the given [role].
  ///
  /// The [host] and [port] default to [RelayConfig.host] and
  /// [RelayConfig.port] respectively.
  VttRelayClient({
    required this.role,
    this.host = RelayConfig.host,
    this.port = RelayConfig.port,
  });

  String get _wsUrl => 'ws://$host:$port';

  /// Opens a WebSocket connection to the relay and registers this client.
  ///
  /// After calling this, listen to [stateStream] to observe connection
  /// progress. If the connection drops, the client automatically
  /// reconnects with exponential backoff.
  void connect() {
    _intentionalClose = false;
    _doConnect();
  }

  void _doConnect() {
    if (_intentionalClose) return;
    _setState(RelayConnectionState.connecting);

    try {
      final uri = Uri.parse(_wsUrl);
      _channel = WebSocketChannel.connect(uri);

      _subscription = _channel!.stream.listen(
        _onData,
        onDone: _onDisconnect,
        onError: (e) {
          debugPrint('VTT relay error: $e');
          _onDisconnect();
        },
      );

      // Send registration
      _send({'type': 'register', 'role': role});
    } catch (e) {
      debugPrint('VTT relay connect failed: $e');
      _setState(RelayConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  /// Public entry point for testing message dispatch.
  ///
  /// Accepts a raw JSON string and routes it through the same message
  /// handler as data received from the WebSocket. Useful for unit
  /// testing without establishing a real connection.
  void handleIncomingMessage(String raw) => _onData(raw);

  void _onData(dynamic raw) {
    if (raw is! String) return;
    _lastDataReceived = DateTime.now();
    try {
      final msg = jsonDecode(raw) as Map<String, dynamic>;
      final type = msg['type'] as String;

      switch (type) {
        case 'registered':
          final paired = msg['paired'] as bool;
          _setState(paired
              ? RelayConnectionState.paired
              : RelayConnectionState.connected);
          _reconnectAttempt = 0; // reset backoff on successful registration
          _consecutiveSendFailures = 0;
          _startHeartbeat();
          debugPrint('VTT relay: registered as $role (paired=$paired)');

        case 'ping':
          // Respond to server/peer ping with pong
          _send({'type': 'pong'});

        case 'pong':
          // Just update _lastDataReceived (already done above)
          break;

        case 'peer_connected':
          _setState(RelayConnectionState.paired);
          debugPrint('VTT relay: peer connected');

        case 'peer_disconnected':
          _setState(RelayConnectionState.connected);
          _mapChunks = null; // discard partial transfer
          _mapChunksReceived = 0;
          debugPrint('VTT relay: peer disconnected');

        case 'error':
          debugPrint('VTT relay error: ${msg['msg']}');

        case 'tv.error':
          onTvError?.call(msg['msg'] as String? ?? 'Unknown error');

        // Chunked map transfer
        case 'vtt.mapStart':
          final count = msg['chunks'] as int;
          _mapChunks = List<String>.filled(count, '');
          _mapChunksReceived = 0;
          lastMapDisplayName = msg['displayName'] as String?;
          _setProgress(0.0);
          debugPrint('VTT relay: map transfer starting ($count chunks, name: $lastMapDisplayName)');

        case 'vtt.mapChunk':
          if (_mapChunks != null) {
            final i = msg['i'] as int;
            _mapChunks![i] = msg['d'] as String;
            _mapChunksReceived++;
            _setProgress(_mapChunksReceived / _mapChunks!.length);
          }

        case 'vtt.mapEnd':
          if (_mapChunks != null) {
            debugPrint('VTT relay: map transfer complete '
                '($_mapChunksReceived/${_mapChunks!.length} chunks)');
            _setProgress(null);
            try {
              final b64 = _mapChunks!.join();
              final bytes = base64Decode(b64);
              onMapLoaded?.call(Uint8List.fromList(bytes));
            } catch (e) {
              debugPrint('VTT relay: map decode error: $e');
            }
            _mapChunks = null;
            _mapChunksReceived = 0;
          }

        case 'vtt.downloadMap':
          // TV tells companion to download map from VPS
          onMapDownloadUrl?.call(
            msg['url'] as String,
            msg['displayName'] as String? ?? 'map',
          );

        case 'lib.listing':
          onLibraryListing?.call(msg);

        case 'update.versionInfo':
          onUpdateVersionInfo?.call(msg);

        case 'update.progress':
          final progress = (msg['progress'] as num).toDouble();
          final status = msg['status'] as String? ?? '';
          onUpdateProgress?.call(progress, status);

        case 'vtt.fullState':
          if (role == 'companion') {
            onStateSync?.call(msg);
            final cam = msg['camera'] as Map<String, dynamic>?;
            if (cam != null) {
              onCameraSync?.call(
                (cam['x'] as num).toDouble(),
                (cam['y'] as num).toDouble(),
                (cam['zoom'] as num).toDouble(),
                (cam['angle'] as num).toDouble(),
              );
            }
          }

        case 'tv.log':
          onTvLog?.call(msg['msg'] as String? ?? '');

        case 'patch.status':
          onPatchStatus?.call(msg);

        case 'patch.progress':
          onPatchProgress?.call(msg);

        default:
          // Forward all app messages (vtt.*, nav.*, lib.*, update.*) to onCommand
          onCommand?.call(msg);
      }
    } catch (e) {
      debugPrint('VTT relay message error: $e');
    }
  }

  void _send(Map<String, dynamic> msg) {
    if (_channel == null) {
      debugPrint('VTT relay send skipped: no connection');
      _trackSendFailure();
      return;
    }
    try {
      _channel!.sink.add(jsonEncode(msg));
      _consecutiveSendFailures = 0;
    } catch (e) {
      debugPrint('VTT relay send error: $e');
      _trackSendFailure();
    }
  }

  /// Sends a pre-encoded JSON string directly over the WebSocket.
  ///
  /// Unlike the typed `send*` methods, this bypasses JSON encoding and
  /// sends [data] as-is. Useful when the caller has already serialised
  /// the payload (e.g., for [sendFullState]).
  void sendRaw(String data) => _sendRaw(data);

  void _sendRaw(String data) {
    if (_channel == null) {
      debugPrint('VTT relay sendRaw skipped: no connection');
      _trackSendFailure();
      return;
    }
    try {
      _channel!.sink.add(data);
      _consecutiveSendFailures = 0;
    } catch (e) {
      debugPrint('VTT relay send error: $e');
      _trackSendFailure();
    }
  }

  void _trackSendFailure() {
    _consecutiveSendFailures++;
    if (_consecutiveSendFailures > _maxSendFailures) {
      debugPrint('VTT relay: $_consecutiveSendFailures consecutive send failures, forcing reconnect');
      _consecutiveSendFailures = 0;
      _forceReconnect();
    }
  }

  void _forceReconnect() {
    _stopHeartbeat();
    _subscription?.cancel();
    _subscription = null;
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    _mapChunks = null;
    _mapChunksReceived = 0;
    _setState(RelayConnectionState.disconnected);
    _scheduleReconnect();
  }

  // --- Chunked map transfer ---

  /// Sends binary map data to the peer in base64-encoded chunks.
  ///
  /// The [bytes] are base64-encoded and split into [_chunkSize] pieces.
  /// A `vtt.mapStart` header is sent first (with the optional
  /// [displayName]), followed by indexed `vtt.mapChunk` messages, and
  /// finally a `vtt.mapEnd` sentinel. Progress is reported via
  /// [onTransferProgress].
  ///
  /// Used by both the companion (uploading to TV) and the TV (sending
  /// to companion as a fallback when no VPS HTTP URL is available).
  void sendMapChunked(Uint8List bytes, {String? displayName}) {
    final b64 = base64Encode(bytes);
    final totalChunks = (b64.length / _chunkSize).ceil();

    debugPrint('VTT relay: sending map in $totalChunks chunks '
        '(${(bytes.length / 1024 / 1024).toStringAsFixed(1)} MB)');

    _setProgress(0.0);
    final startMsg = <String, dynamic>{'type': 'vtt.mapStart', 'chunks': totalChunks};
    if (displayName != null) startMsg['displayName'] = displayName;
    _send(startMsg);

    for (var i = 0; i < totalChunks; i++) {
      final start = i * _chunkSize;
      final end = min(start + _chunkSize, b64.length);
      _send({'type': 'vtt.mapChunk', 'i': i, 'd': b64.substring(start, end)});
      _setProgress((i + 1) / totalChunks);
    }

    _send({'type': 'vtt.mapEnd'});
    _setProgress(null);
  }

  void _setProgress(double? progress) {
    _transferProgress = progress;
    if (progress != null) {
      onTransferProgress?.call(progress);
    } else {
      onTransferProgress?.call(-1); // signal done
    }
  }

  // --- Command methods (companion → table via relay) ---

  /// Tells the TV to unload the current map.
  void sendClearMap() => _send({'type': 'vtt.clearMap'});

  /// Toggles the fog-of-war reveal state for a single cell at [index].
  void sendToggleReveal(int index) =>
      _send({'type': 'vtt.toggleReveal', 'index': index});

  /// Reveals (or hides) multiple fog cells at once using the brush.
  ///
  /// [indices] is a list of flat cell indices computed from the brush
  /// radius and the grid position the DM is painting.
  void sendBrushReveal(List<int> indices) =>
      _send({'type': 'vtt.brushReveal', 'indices': indices});

  /// Reveals all fog-of-war cells on the current map.
  void sendRevealAll() => _send({'type': 'vtt.revealAll'});

  /// Hides all fog-of-war cells on the current map.
  void sendHideAll() => _send({'type': 'vtt.hideAll'});

  /// Toggles the open/closed state of the portal (door) at [index].
  void sendTogglePortal(int index) =>
      _send({'type': 'vtt.togglePortal', 'index': index});

  /// Toggles the grid overlay visibility on the TV.
  void sendToggleGrid() => _send({'type': 'vtt.toggleGrid'});

  /// Toggles the fog-of-war layer visibility on the TV.
  void sendToggleFog() => _send({'type': 'vtt.toggleFog'});

  /// Toggles the wall debug overlay visibility on the TV.
  void sendToggleWalls() => _send({'type': 'vtt.toggleWalls'});

  /// Sets the fog brush radius to [radius] grid cells.
  void sendSetBrushRadius(int radius) =>
      _send({'type': 'vtt.setBrushRadius', 'radius': radius});

  /// Toggles the brush between reveal and hide mode.
  void sendToggleRevealMode() => _send({'type': 'vtt.toggleRevealMode'});

  /// Zooms the TV camera in by one step.
  void sendZoomIn() => _send({'type': 'vtt.zoomIn'});

  /// Zooms the TV camera out by one step.
  void sendZoomOut() => _send({'type': 'vtt.zoomOut'});

  /// Resets the TV camera zoom so the entire map fits on screen.
  void sendZoomToFit() => _send({'type': 'vtt.zoomToFit'});

  /// Rotates the TV camera 90 degrees clockwise.
  void sendRotateCW() => _send({'type': 'vtt.rotateCW'});

  /// Rotates the TV camera 90 degrees counter-clockwise.
  void sendRotateCCW() => _send({'type': 'vtt.rotateCCW'});

  /// Resets the TV camera rotation to 0 degrees.
  void sendResetRotation() => _send({'type': 'vtt.resetRotation'});

  /// Calibrates the TV display so that grid squares match physical
  /// inches on the TV surface.
  ///
  /// [tvWidthInches] is the measured diagonal or width of the TV screen
  /// in inches, used to compute the correct base zoom level.
  void sendCalibrate(double tvWidthInches) =>
      _send({'type': 'vtt.calibrate', 'tvWidthInches': tvWidthInches});

  /// Resets the TV calibration, reverting to default zoom behaviour.
  void sendResetCalibration() => _send({'type': 'vtt.resetCalibration'});

  // --- Interaction mode ---

  /// Switches the TV's active interaction mode.
  ///
  /// [mode] must be one of `"fogReveal"`, `"draw"`, or `"token"`,
  /// matching [InteractionMode.name].
  void sendSetInteractionMode(String mode) =>
      _send({'type': 'vtt.setMode', 'mode': mode});

  // --- Token commands (companion → table via relay) ---

  /// Places a new token at grid position ([gridX], [gridY]) on the TV.
  void sendAddToken(int gridX, int gridY) =>
      _send({'type': 'vtt.addToken', 'gridX': gridX, 'gridY': gridY});

  /// Moves the token identified by [id] to grid position ([gridX], [gridY]).
  void sendMoveToken(String id, int gridX, int gridY) =>
      _send({'type': 'vtt.moveToken', 'id': id, 'gridX': gridX, 'gridY': gridY});

  /// Removes the token identified by [id] from the TV map.
  void sendRemoveToken(String id) =>
      _send({'type': 'vtt.removeToken', 'id': id});

  /// Removes all tokens from the TV map.
  void sendClearTokens() => _send({'type': 'vtt.clearTokens'});

  // --- Drawing commands (companion → table via relay) ---

  /// Commits a completed freehand drawing stroke on the TV.
  ///
  /// [strokeJson] is a serialised [DrawStroke] including points, color,
  /// and width.
  void sendAddStroke(Map<String, dynamic> strokeJson) =>
      _send({'type': 'vtt.addStroke', 'stroke': strokeJson});

  /// Sends a live stroke preview update while the user is still drawing.
  ///
  /// Pass `null` for [strokeJson] to clear the live preview.
  void sendStrokeUpdate(Map<String, dynamic>? strokeJson) =>
      _send({'type': 'vtt.strokeUpdate', 'stroke': strokeJson});

  /// Signals that the current live stroke has ended.
  void sendStrokeEnd() => _send({'type': 'vtt.strokeEnd'});

  /// Clears all drawing strokes from the TV map.
  void sendClearDrawings() => _send({'type': 'vtt.clearDrawings'});

  /// Undoes the most recent drawing stroke on the TV map.
  void sendUndoStroke() => _send({'type': 'vtt.undoStroke'});

  /// Sets the drawing color on the TV.
  ///
  /// [colorValue] is an ARGB32 integer (e.g., `Color.toARGB32()`).
  void sendSetDrawColor(int colorValue) =>
      _send({'type': 'vtt.setDrawColor', 'color': colorValue});

  /// Sets the drawing stroke width on the TV.
  void sendSetDrawWidth(double width) =>
      _send({'type': 'vtt.setDrawWidth', 'width': width});

  // --- Navigation commands (companion → table) ---

  /// Navigates the TV to the map library view.
  void sendGoToLibrary() => _send({'type': 'nav.goToLibrary'});

  /// Navigates the TV to the settings view.
  void sendGoToSettings() => _send({'type': 'nav.goToSettings'});

  /// Navigates the TV to the game view for [mapId].
  ///
  /// If [sessionId] is provided, the TV resumes that saved session.
  /// Otherwise a new session is created with the optional [name].
  void sendGoToGame(String mapId, {String? sessionId, String? name}) {
    final msg = <String, dynamic>{'type': 'nav.goToGame', 'mapId': mapId};
    if (sessionId != null) msg['sessionId'] = sessionId;
    if (name != null) msg['name'] = name;
    _send(msg);
  }

  /// Creates a brand-new session for [mapId] on the TV.
  ///
  /// The session is given the optional [name] (defaults to "Session" on
  /// the TV side if omitted).
  void sendNewSession(String mapId, {String? name}) {
    final msg = <String, dynamic>{'type': 'nav.newSession', 'mapId': mapId};
    if (name != null) msg['name'] = name;
    _send(msg);
  }

  // --- Library commands (companion → table) ---

  /// Requests the TV to send back a `lib.listing` with all maps and sessions.
  void sendRequestList() => _send({'type': 'lib.requestList'});

  /// Deletes the map identified by [mapId] from the TV's local library.
  void sendDeleteMap(String mapId) =>
      _send({'type': 'lib.deleteMap', 'mapId': mapId});

  /// Deletes the saved session identified by [sessionId] from the TV.
  void sendDeleteSession(String sessionId) =>
      _send({'type': 'lib.deleteSession', 'sessionId': sessionId});

  /// Renames the session identified by [sessionId] to [name] on the TV.
  void sendRenameSession(String sessionId, String name) =>
      _send({'type': 'lib.renameSession', 'sessionId': sessionId, 'name': name});

  // --- Update commands (companion → table) ---

  /// Asks the TV to check for an available APK update on the VPS.
  void sendCheckUpdate() => _send({'type': 'update.check'});

  /// Tells the TV to download and install the latest APK update.
  void sendStartUpdate() => _send({'type': 'update.download'});

  /// Check for a Shorebird OTA patch.
  void sendPatchCheck() => _send({'type': 'patch.check'});

  /// Download the available Shorebird patch.
  void sendPatchDownload() => _send({'type': 'patch.download'});

  /// Restart the TV app to apply the downloaded patch.
  void sendPatchRestart() => _send({'type': 'patch.restart'});

  // --- Table → companion broadcasts ---

  /// Broadcasts the TV's full game state to the companion.
  ///
  /// [stateJson] is the serialised [VttState] (fog, portals, tokens, etc.)
  /// and [camera] contains `x`, `y`, `zoom`, and `angle` keys describing
  /// the current camera transform. This is called at up to 20 Hz from the
  /// TV's throttled broadcast timer.
  void sendFullState(Map<String, dynamic> stateJson, Map<String, double> camera) {
    final json = {
      'type': 'vtt.fullState',
      ...stateJson,
      'camera': camera,
    };
    _sendRaw(jsonEncode(json));
  }

  // --- Heartbeat ---

  void _startHeartbeat() {
    _stopHeartbeat();
    _lastDataReceived = DateTime.now();
    _heartbeatTimer = Timer.periodic(_pingInterval, (_) {
      // Send ping
      _send({'type': 'ping'});

      // Check if we haven't received any data in _pongTimeout
      final elapsed = DateTime.now().difference(_lastDataReceived);
      if (elapsed > _pongTimeout) {
        debugPrint('VTT relay: no data received for ${elapsed.inSeconds}s, forcing reconnect');
        _forceReconnect();
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  // --- Connection management ---

  void _onDisconnect() {
    _stopHeartbeat();
    _subscription?.cancel();
    _subscription = null;
    _channel = null;
    _mapChunks = null;
    _mapChunksReceived = 0;
    if (!_intentionalClose) {
      _setState(RelayConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_intentionalClose) return;
    _reconnectTimer?.cancel();
    final backoffIndex = _reconnectAttempt.clamp(0, _backoffSeconds.length - 1);
    final delay = _backoffSeconds[backoffIndex];
    _reconnectAttempt++;
    debugPrint('VTT relay: reconnecting in ${delay}s (attempt $_reconnectAttempt)');
    _reconnectTimer = Timer(Duration(seconds: delay), () {
      if (_state != RelayConnectionState.paired &&
          _state != RelayConnectionState.connected &&
          !_intentionalClose) {
        _doConnect();
      }
    });
  }

  void _setState(RelayConnectionState newState) {
    if (_state == newState) return;
    _state = newState;
    _stateController.add(newState);
  }

  /// Permanently closes the WebSocket connection and cancels all timers.
  ///
  /// After calling this, the client will not attempt to reconnect.
  /// Always call this in the owning widget's `dispose()`.
  void dispose() {
    _intentionalClose = true;
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _stateController.close();
  }
}
