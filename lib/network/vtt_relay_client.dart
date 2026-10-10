import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:ui' show Offset;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleListener, AppLifecycleState;
import 'package:web_socket_channel/web_socket_channel.dart';

import 'relay_config.dart';
import 'remote_log_stub.dart' if (dart.library.io) 'remote_log.dart';
import '../model/raster_grid.dart';
import '../model/table_fit.dart';

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

  /// Another client registered with the same role and took over the relay
  /// slot (the relay sent `replaced`). Automatic reconnection is off in this
  /// state — otherwise two devices in the same role knock each other out
  /// every second. Call [VttRelayClient.connect] to take the slot back.
  replaced,
}

/// Unified WebSocket client that connects to the VPS relay server.
///
/// Works on both web (Safari) and native (APK) platforms via the
/// `web_socket_channel` package. Each client registers with a [role]
/// ("table" or "companion") and the relay pairs one table with one
/// companion, forwarding JSON messages between them.
///
/// Key features:
/// - **Automatic reconnection** with a short backoff (1 s, 2 s, 3 s, then
///   every 5 s) after disconnects or send failures, an attempt that hasn't
///   registered within 8 s is given up and retried, and the app coming back
///   from the background reconnects at once — except after the relay says
///   `replaced` ([RelayConnectionState.replaced]).
/// - **No late replay** — a command sent while not connected is dropped
///   (and reported via [onCommandDropped]) instead of waiting in the socket:
///   before 2026-10-10 a minute of tablet commands reached the TV all at
///   once after a reconnect.
/// - **Heartbeat** — sends a `ping` every 15 seconds and forces a reconnect
///   if no data arrives within 30 seconds.
/// - **Chunked map transfer** — large binary map files are base64-encoded,
///   split into 500 KB chunks, and sent as a sequence of `vtt.mapStart`,
///   `vtt.mapChunk`, and `vtt.mapEnd` messages.
/// - **Connection state stream** — listeners can observe
///   [RelayConnectionState] transitions via [stateStream].
/// - **Connection diagnostics** to MwLog (tag `relay`, both devices): every
///   attempt, drop (close code, how long it lived), outage length, commands
///   dropped while offline, round-trip time per heartbeat, late messages from the peer
///   (their `sent` stamp), slow handlers and stalled event loops.
///   `docs/setup.md` "logs" → "relay diagnostics".
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

  /// Called when `peer_connected` arrives while already paired — a new
  /// peer replaced the old one in its slot (relay takeover). The TV resends
  /// its library and game then; before 2026-10-10 a takeover companion sat
  /// on "Connected to TV" with no map.
  void Function()? onPeerReconnected;

  /// Called on `deploy.ready` (companion side): the TV is about to be
  /// replaced by a rolling deploy and will be back in a few seconds.
  void Function(Map<String, dynamic> msg)? onDeployReady;

  /// Called when a `vtt.fullState` message is received (companion side only).
  ///
  /// Contains the complete serialised [VttState] plus TV view metadata so
  /// the companion can mirror what the TV is showing.
  void Function(Map<String, dynamic> msg)? onStateSync;

  /// Called when camera state is received as part of a `vtt.fullState`
  /// (companion side only).
  ///
  /// Parameters are the camera's world-space `x`, `y`, `zoom` level,
  /// rotation `angle` in radians, and the TV viewport size `vw` × `vh` in
  /// screen pixels (0 when the TV build predates the `vw`/`vh` fields).
  /// The companion draws that viewport as a dashed rectangle — it does
  /// **not** move its own camera.
  void Function(double x, double y, double zoom, double angle, double vw,
      double vh)? onCameraSync;

  /// Called when a chunked map transfer completes (either side).
  ///
  /// The `bytes` argument contains the raw `.dd2vtt` / `.uvtt` file data
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

  /// Called when a `lib.thumbnail` arrives (companion side): the PNG
  /// thumbnail of library map [mapId], answering [sendGetThumbnail] or
  /// pushed by the TV as soon as it has made a missing one.
  void Function(String mapId, Uint8List png)? onThumbnail;

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
  /// notice on the companion UI.
  void Function(String msg)? onTvError;

  /// Called when the TV starts/stops a heavy rendering operation.
  void Function(bool active, String label)? onTvRendering;

  /// Called when Shorebird patch status is received (companion side).
  void Function(Map<String, dynamic> status)? onPatchStatus;

  /// Called when Shorebird patch download progress/completion is received.
  void Function(Map<String, dynamic> progress)? onPatchProgress;

  /// Called when a command of [type] was dropped because the client is not
  /// connected to the relay (connecting or waiting to reconnect). The
  /// companion tells the DM it didn't reach the TV.
  void Function(String type)? onCommandDropped;

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _reconnectTimer;

  /// Gives up a connection attempt that hasn't registered within
  /// [_connectTimeout] (a hanging TCP connect otherwise waits out the OS,
  /// up to a minute or more).
  Timer? _connectTimer;
  static const Duration _connectTimeout = Duration(seconds: 8);
  Timer? _heartbeatTimer;
  bool _intentionalClose = false;

  /// Set when the relay sent `replaced`: another device took this role, so
  /// the client stays disconnected until [connect] is called again.
  bool _replaced = false;

  // Heartbeat tracking
  DateTime _lastDataReceived = DateTime.now();
  static const Duration _pingInterval = Duration(seconds: 15);
  static const Duration _pongTimeout = Duration(seconds: 30);

  // Reconnection backoff
  int _reconnectAttempt = 0;
  static const List<int> _backoffSeconds = [1, 2, 3, 5];

  // Send failure tracking
  int _consecutiveSendFailures = 0;
  static const int _maxSendFailures = 5;

  // --- Diagnostics (MwLog, tag `relay`) ---

  /// When the current connection attempt started (for `connectMs`).
  DateTime? _attemptStartedAt;

  /// When the relay confirmed `registered` for the live connection; `null`
  /// while not registered.
  DateTime? _registeredAt;

  /// When the last registered connection was lost; `null` while it lives.
  /// The outage length is logged on the next `registered`.
  DateTime? _lostAt;

  /// Commands dropped while not connected (no socket, or connecting and not
  /// yet registered), by type. Logged on the next `registered`.
  final Map<String, int> _droppedOffline = {};

  /// When the first command in [_droppedOffline] was dropped.
  DateTime? _firstDropAt;

  /// Messages sent while registered but without a peer (the relay drops
  /// them), by type.
  final Map<String, int> _sentWithoutPeer = {};

  /// A message from the peer older than this (by its `sent` stamp) is late.
  static const int _lateMs = 1500;

  /// Late messages in the current burst and the oldest one's age.
  int _lateCount = 0;
  int _lateMaxMs = 0;

  /// A handler that runs longer than this is logged.
  static const int _slowHandlerMs = 250;

  /// Ticks once a second; a late tick means the event loop was blocked (or
  /// the app was paused) and nothing — sends, receives, frames — ran.
  Timer? _stallTimer;
  DateTime _lastStallTick = DateTime.now();
  static const int _stallMs = 700;

  /// Logs the app going to the background and back: Android may cut a
  /// paused app's socket, which then reconnects only on resume.
  AppLifecycleListener? _lifecycle;

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
  ///
  /// Also the way back after [RelayConnectionState.replaced]: registering
  /// again takes the slot from whichever device holds it now.
  void connect() {
    _intentionalClose = false;
    _replaced = false;
    _startStallWatch();
    try {
      _lifecycle ??= AppLifecycleListener(
        onStateChange: (AppLifecycleState s) {
          RemoteLog.info('relay', 'App lifecycle: ${s.name}',
              {'role': role, 'state': _state.name});
          // Back from the background: don't wait out a backoff timer.
          if (s == AppLifecycleState.resumed &&
              (_state == RelayConnectionState.disconnected ||
                  _state == RelayConnectionState.connecting)) {
            _reconnectAttempt = 0;
            _forceReconnect('app resumed', backoff: false);
          }
        },
      );
    } catch (_) {
      // No widgets binding (unit tests): no lifecycle log.
    }
    _doConnect();
  }

  void _doConnect() {
    if (_intentionalClose || _replaced) return;
    _setState(RelayConnectionState.connecting);
    _attemptStartedAt = DateTime.now();
    _connectTimer?.cancel();
    _connectTimer = Timer(_connectTimeout, () {
      if (_state == RelayConnectionState.connecting) {
        _forceReconnect('no registration within ${_connectTimeout.inSeconds}s');
      }
    });
    RemoteLog.info('relay', 'Connecting to relay',
        {'role': role, 'url': _wsUrl, 'attempt': _reconnectAttempt + 1});

    try {
      final uri = Uri.parse(_wsUrl);
      final channel = WebSocketChannel.connect(uri);
      _channel = channel;
      channel.ready.then((_) {
        RemoteLog.debug('relay', 'Socket open',
            {'role': role, 'connectMs': _sinceMs(_attemptStartedAt)});
      }, onError: (Object e) {
        RemoteLog.warn('relay', 'Socket connect failed',
            {'role': role, 'error': '$e', 'afterMs': _sinceMs(_attemptStartedAt)});
      });

      _subscription = channel.stream.listen(
        _onData,
        onDone: _onDisconnect,
        onError: (e) {
          debugPrint('VTT relay error: $e');
          _onDisconnect(error: e);
        },
      );

      // Send registration
      _send({'type': 'register', 'role': role});
    } catch (e) {
      debugPrint('VTT relay connect failed: $e');
      RemoteLog.warn('relay', 'Connect failed', {'role': role, 'error': '$e'});
      _setState(RelayConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  /// Snapshot of the connection diagnostics that are not logged yet:
  /// sends waiting for a connection or dropped without a socket or a peer,
  /// and the current burst of late messages from the peer.
  Map<String, int> get diagnostics => {
        'droppedOffline': _total(_droppedOffline),
        'sentWithoutPeer': _total(_sentWithoutPeer),
        'lateCount': _lateCount,
        'lateMaxMs': _lateMaxMs,
      };

  /// Milliseconds since [t], or `null` when [t] is unset.
  static int? _sinceMs(DateTime? t) =>
      t == null ? null : DateTime.now().difference(t).inMilliseconds;

  /// Total of a per-type counter map.
  static int _total(Map<String, int> m) => m.values.fold(0, (a, b) => a + b);

  /// Logs the connection's arrival: how long the attempt and the outage took,
  /// and what was sent while offline (it reaches the peer now, late) or into
  /// a missing peer (the relay dropped it).
  void _logRegistered(bool paired) {
    final outageMs = _sinceMs(_lostAt);
    RemoteLog.info('relay', 'Registered with relay', {
      'role': role,
      'paired': paired,
      'attempt': _reconnectAttempt + 1,
      'connectMs': _sinceMs(_attemptStartedAt),
      if (outageMs != null) 'outageMs': outageMs,
    });
    final dropped = _total(_droppedOffline);
    if (dropped > 0) {
      RemoteLog.warn('relay', 'Dropped while offline', {
        'role': role,
        'count': dropped,
        'firstAgoMs': _sinceMs(_firstDropAt),
        'types': _droppedOffline.toString(),
      });
    }
    _droppedOffline.clear();
    _firstDropAt = null;
    _registeredAt = DateTime.now();
    _lostAt = null;
  }

  /// Logs what was sent while the relay had no peer to give it to.
  void _logPeerBack() {
    final n = _total(_sentWithoutPeer);
    if (n > 0) {
      RemoteLog.warn('relay', 'Sent while the peer was away (dropped by relay)',
          {'role': role, 'count': n, 'types': _sentWithoutPeer.toString()});
      _sentWithoutPeer.clear();
    }
  }

  /// Checks the peer's `sent` stamp on [msg]: older than [_lateMs] is late.
  /// The first late message of a burst is logged at once, the burst's size
  /// and worst age when an on-time message ends it. Ages compare two devices'
  /// clocks (both NTP), so only seconds-scale delays are meaningful.
  void _checkLate(Map<String, dynamic> msg, String type) {
    final sent = msg['sent'];
    if (sent is! int) return;
    final age = DateTime.now().millisecondsSinceEpoch - sent;
    if (age > _lateMs) {
      if (_lateCount == 0) {
        RemoteLog.warn('relay', 'Late message from peer',
            {'role': role, 'type': type, 'ageMs': age});
      }
      _lateCount++;
      _lateMaxMs = max(_lateMaxMs, age);
    } else if (_lateCount > 0) {
      RemoteLog.warn('relay', 'Late messages ended',
          {'role': role, 'count': _lateCount, 'maxAgeMs': _lateMaxMs});
      _lateCount = 0;
      _lateMaxMs = 0;
    }
  }

  /// Starts the once-a-second tick that notices a blocked event loop.
  void _startStallWatch() {
    _stallTimer?.cancel();
    _lastStallTick = DateTime.now();
    _stallTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      final now = DateTime.now();
      final lag = now.difference(_lastStallTick).inMilliseconds - 1000;
      _lastStallTick = now;
      if (lag > _stallMs) {
        RemoteLog.warn('relay', 'Event loop stalled (or app paused)',
            {'role': role, 'stallMs': lag, 'state': _state.name});
      }
    });
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
    final started = _lastDataReceived;
    String? type;
    try {
      final msg = jsonDecode(raw) as Map<String, dynamic>;
      type = msg['type'] as String;
      _checkLate(msg, type);

      switch (type) {
        case 'registered':
          final paired = msg['paired'] as bool;
          _connectTimer?.cancel();
          _logRegistered(paired);
          _setState(paired
              ? RelayConnectionState.paired
              : RelayConnectionState.connected);
          _reconnectAttempt = 0; // reset backoff on successful registration
          _consecutiveSendFailures = 0;
          _startHeartbeat();
          debugPrint('VTT relay: registered as $role (paired=$paired)');

        case 'ping':
          // Respond to server/peer ping with pong; echo the peer's stamp so
          // it can measure the round trip (the relay forwards stamped pongs).
          final t = msg['sent'];
          _send({'type': 'pong', if (t is int) 't': t});

        case 'pong':
          // _lastDataReceived is already updated above. A pong to our own
          // ping carries its stamp back: the round trip through the relay
          // and the peer's event loop.
          final t = msg['t'];
          if (t is int) {
            final rtt = DateTime.now().millisecondsSinceEpoch - t;
            if (rtt > 1000) {
              RemoteLog.warn('relay', 'Slow round trip', {'role': role, 'rttMs': rtt});
            } else {
              RemoteLog.debug('relay', 'Round trip', {'role': role, 'rttMs': rtt});
            }
          }

        case 'replaced':
          // Another device registered with our role. Stop here instead of
          // reconnecting, or the two would take the slot from each other
          // forever. The relay closes the socket right after this message.
          _replaced = true;
          _reconnectTimer?.cancel();
          _stopHeartbeat();
          _setState(RelayConnectionState.replaced);
          RemoteLog.warn('relay', 'Replaced by another device in this role',
              {'role': role});
          debugPrint('VTT relay: replaced by another $role, not reconnecting');

        case 'peer_connected':
          final wasPaired = _state == RelayConnectionState.paired;
          _setState(RelayConnectionState.paired);
          RemoteLog.info('relay', 'Peer connected',
              {'role': role, 'takeover': wasPaired});
          _logPeerBack();
          debugPrint('VTT relay: peer connected');
          // A new peer took over the slot (e.g. the tablet replaced another
          // companion): no state change, but the newcomer has nothing yet.
          if (wasPaired) onPeerReconnected?.call();

        case 'deploy.ready':
          onDeployReady?.call(msg);

        case 'peer_disconnected':
          _setState(RelayConnectionState.connected);
          _mapChunks = null; // discard partial transfer
          _mapChunksReceived = 0;
          RemoteLog.warn('relay', 'Peer disconnected', {'role': role});
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

        case 'lib.thumbnail':
          try {
            onThumbnail?.call(
                msg['mapId'] as String, base64Decode(msg['png'] as String));
          } catch (e) {
            debugPrint('VTT relay: bad thumbnail: $e');
          }

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
                (cam['vw'] as num?)?.toDouble() ?? 0,
                (cam['vh'] as num?)?.toDouble() ?? 0,
              );
            }
          }

        case 'tv.log':
          onTvLog?.call(msg['msg'] as String? ?? '');

        case 'tv.rendering':
          onTvRendering?.call(
            msg['active'] as bool? ?? false,
            msg['label'] as String? ?? '',
          );

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
      RemoteLog.warn('relay', 'Message handling failed',
          {'role': role, 'type': type, 'error': '$e'});
    }
    final took = DateTime.now().difference(started).inMilliseconds;
    if (took > _slowHandlerMs) {
      RemoteLog.warn('relay', 'Slow message handler',
          {'role': role, 'type': type, 'ms': took});
    }
  }

  /// Notes a message sent while not paired: connecting means it waits in the
  /// socket and arrives late; registered without a peer means the relay
  /// drops it. Both are logged when the connection or the peer is back.
  void _countUnpaired(String type) {
    if (_state == RelayConnectionState.connected && type != 'ping' && type != 'pong') {
      _sentWithoutPeer[type] = (_sentWithoutPeer[type] ?? 0) + 1;
    }
  }

  /// Whether a message may go out now: the relay has registered this socket.
  /// While still connecting, the socket would hold it and deliver it late,
  /// all at once with everything else sent meanwhile.
  bool get _canSend =>
      _channel != null &&
      (_state == RelayConnectionState.paired ||
          _state == RelayConnectionState.connected);

  /// Drops a message of [type] that can't go out now ([_canSend]), counts
  /// it for the log and tells [onCommandDropped] (heartbeats aside).
  ///
  /// No send-failure tracking here: a reconnect is already under way, and
  /// before 2026-10-10 every few taps during an outage pushed the
  /// reconnect timer further out (up to a minute).
  void _drop(String type) {
    if (type == 'ping' || type == 'pong') return;
    debugPrint('VTT relay: not connected, dropped $type');
    _droppedOffline[type] = (_droppedOffline[type] ?? 0) + 1;
    _firstDropAt ??= DateTime.now();
    onCommandDropped?.call(type);
  }

  /// Sends [msg] stamped with `sent` (epoch ms), which the peer uses to
  /// notice late messages ([_checkLate]) and to answer pings. Only
  /// `register` goes out before the relay has answered; anything else is
  /// dropped while not connected ([_drop]).
  void _send(Map<String, dynamic> msg) {
    final type = msg['type'] as String? ?? '?';
    if (type == 'register' ? _channel == null : !_canSend) {
      _drop(type);
      return;
    }
    _countUnpaired(type);
    msg['sent'] = DateTime.now().millisecondsSinceEpoch;
    try {
      _channel!.sink.add(jsonEncode(msg));
      _consecutiveSendFailures = 0;
    } catch (e) {
      debugPrint('VTT relay send error: $e');
      RemoteLog.warn('relay', 'Send failed', {'role': role, 'type': type, 'error': '$e'});
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
    if (!_canSend) {
      _drop('raw');
      return;
    }
    try {
      _channel!.sink.add(data);
      _consecutiveSendFailures = 0;
    } catch (e) {
      debugPrint('VTT relay send error: $e');
      RemoteLog.warn('relay', 'Send failed', {'role': role, 'type': 'raw', 'error': '$e'});
      _trackSendFailure();
    }
  }

  void _trackSendFailure() {
    _consecutiveSendFailures++;
    if (_consecutiveSendFailures > _maxSendFailures) {
      debugPrint('VTT relay: $_consecutiveSendFailures consecutive send failures, forcing reconnect');
      _consecutiveSendFailures = 0;
      _forceReconnect('send failures');
    }
  }

  /// Drops the socket and reconnects — after the backoff, or at once when
  /// [backoff] is false; [reason] goes to the log.
  void _forceReconnect(String reason, {bool backoff = true}) {
    _connectTimer?.cancel();
    RemoteLog.warn('relay', 'Forcing reconnect', {
      'role': role,
      'reason': reason,
      'lastDataAgoMs': DateTime.now().difference(_lastDataReceived).inMilliseconds,
      if (_registeredAt != null) 'upS': DateTime.now().difference(_registeredAt!).inSeconds,
    });
    if (_registeredAt != null) _lostAt ??= DateTime.now();
    _registeredAt = null;
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
    if (backoff) {
      _scheduleReconnect();
    } else {
      _reconnectTimer?.cancel();
      _doConnect();
    }
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

  /// Calibrates the TV: its picture is [tvWidthInches] wide (the whole
  /// image the app draws, not the diagonal). The TV keeps it on its own disk and shows
  /// every map at one inch per square from then on ([TableGrid]).
  void sendCalibrate(double tvWidthInches) =>
      _send({'type': 'vtt.calibrate', 'tvWidthInches': tvWidthInches});

  /// Tells the TV how much of its picture the set cuts off at each edge
  /// ([percent], overscan): only the squares it really shows count
  /// ([TableGrid.overscanPercent]). The TV keeps it on its own disk.
  void sendSetOverscan(double percent) =>
      _send({'type': 'vtt.setOverscan', 'percent': percent});

  /// Resets the TV calibration to auto: [TableGrid.defaultScreenWidthInches]
  /// (34 × 19 squares) and no overscan.
  void sendResetCalibration() => _send({'type': 'vtt.resetCalibration'});

  /// Shows ([on]) or hides the TV's calibration pattern: every one-inch
  /// square of the table window and a 10-inch measuring bar starting at
  /// [pivot] (a screen corner or the centre, where the ruler's zero goes).
  void sendShowCalibration(bool on,
          [CalibrationPivot pivot = CalibrationPivot.bottomLeft]) =>
      _send({'type': 'vtt.showCalibration', 'on': on, 'pivot': pivot.name});

  /// Switches how the TV frames the map: [mode] is a [TvCameraMode] name —
  /// `table` (one inch per square), `fit` (whole map) or `free`.
  void sendSetTvCameraMode(String mode) =>
      _send({'type': 'vtt.setTvCameraMode', 'mode': mode});

  /// Moves the TV's table window by [dx] × [dy] squares (map axes); the TV
  /// clamps it to the map and switches to the table view.
  void sendPanTable(int dx, int dy) =>
      _send({'type': 'vtt.panTable', 'dx': dx, 'dy': dy});

  /// Puts the TV's table window's first square at [col]/[row] (map
  /// squares; the TV clamps, an axis where the map fits stays centred).
  void sendSetTableWindow(int col, int row) =>
      _send({'type': 'vtt.setTableWindow', 'col': col, 'row': row});

  /// Lays a new grid of [cols] × [rows] squares over the open picture or
  /// PDF map; the library keeps it. [grid] places the squares exactly
  /// (position, width, height — from the grid editor), without it they are
  /// stretched over the whole picture. The game's fog stays when the counts
  /// stay (`VttState.regridRaster`).
  void sendSetMapGrid(int cols, int rows, {RasterGrid? grid}) => _send({
        'type': 'vtt.setMapGrid',
        'cols': cols,
        'rows': rows,
        if (grid != null) 'grid': grid.toJson(),
      });

  /// Moves the TV camera to an absolute transform.
  ///
  /// [camera] holds `x`, `y` (world center), `zoom` and `angle` (radians)
  /// — the phone's own camera when "link TV to phone" is on or "send view"
  /// is tapped. Extra keys (`vw`, `vh`) are ignored by the TV. In the TV's
  /// table view only the centre counts (the window moves there, one inch
  /// per square stays).
  void sendSetCamera(Map<String, double> camera) => _send({
        'type': 'vtt.setCamera',
        'x': camera['x'],
        'y': camera['y'],
        'zoom': camera['zoom'],
        'angle': camera['angle'],
      });

  /// Sets or clears the measurement line on the TV.
  ///
  /// Coordinates are world pixels. Pass `null` for [start] and [end] to
  /// hide the line (the message then carries no coordinates).
  void sendSetMeasure(Offset? start, Offset? end) {
    final msg = <String, dynamic>{'type': 'vtt.setMeasure'};
    if (start != null && end != null) {
      msg['x1'] = start.dx;
      msg['y1'] = start.dy;
      msg['x2'] = end.dx;
      msg['y2'] = end.dy;
    }
    _send(msg);
  }

  // --- Interaction mode ---

  /// Switches the TV's active interaction mode.
  ///
  /// `mode` must be one of `"fogReveal"`, `"draw"`, `"token"`, or
  /// `"measure"`, matching `InteractionMode.name` from
  /// `lib/state/vtt_state.dart`.
  void sendSetInteractionMode(String mode) =>
      _send({'type': 'vtt.setMode', 'mode': mode});

  /// Convenience method to switch to measure mode on the TV.
  void sendSetMeasureMode() => sendSetInteractionMode('measure');

  /// Convenience method to switch to room reveal mode on the TV.
  void sendSetRoomRevealMode() => sendSetInteractionMode('roomReveal');

  /// Convenience method to switch to AoE template mode on the TV.
  void sendSetAoeMode() => sendSetInteractionMode('aoe');

  // --- Token commands (companion → table via relay) ---

  /// Places a new token at grid position ([gridX], [gridY]) on the TV.
  void sendAddToken(int gridX, int gridY) =>
      _send({'type': 'vtt.addToken', 'gridX': gridX, 'gridY': gridY});

  /// Moves the token identified by [id] to grid position ([gridX], [gridY]).
  void sendMoveToken(String id, int gridX, int gridY) =>
      _send({'type': 'vtt.moveToken', 'id': id, 'gridX': gridX, 'gridY': gridY});

  /// Creates a token on the TV that does not stand on the map yet, named
  /// [name] ([VttState.createToken]); `vtt.moveToken` places it later.
  void sendCreateToken(String name) =>
      _send({'type': 'vtt.createToken', 'name': name});

  /// Hides the token [id] from the players (the TV leaves it out) or shows
  /// it again ([VttState.setTokenHidden]).
  void sendSetTokenHidden(String id, bool hidden) =>
      _send({'type': 'vtt.setTokenHidden', 'id': id, 'hidden': hidden});

  /// Removes the token identified by [id] from the TV map.
  void sendRemoveToken(String id) =>
      _send({'type': 'vtt.removeToken', 'id': id});

  /// Edits combat metadata on an existing token on the TV.
  ///
  /// [id] is the [MapToken.id]. [name], [maxHp], [currentHp], and
  /// [conditions] replace the token's current values.
  void sendEditToken(String id, {required String name, required int maxHp, required int currentHp, required List<String> conditions}) =>
      _send({'type': 'vtt.editToken', 'id': id, 'name': name, 'maxHp': maxHp, 'currentHp': currentHp, 'conditions': conditions});

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

  // --- Undo / Redo (companion → table via relay) ---

  /// Tells the TV to undo the most recent action.
  void sendUndo() => _send({'type': 'vtt.undo'});

  /// Tells the TV to redo the most recently undone action.
  void sendRedo() => _send({'type': 'vtt.redo'});

  // --- Shadow mode (companion → table via relay) ---

  /// Toggles the TV's fog shadow mode on/off.
  void sendToggleShadowMode() => _send({'type': 'vtt.toggleShadowMode'});

  /// Commits pending shadow fog cells on the TV.
  void sendCommitShadow() => _send({'type': 'vtt.commitShadow'});

  /// Clears pending shadow fog cells on the TV without committing.
  void sendClearShadow() => _send({'type': 'vtt.clearShadow'});

  // --- Room reveal (companion → table via relay) ---

  /// Reveals a connected room (set of cells) on the TV at once.
  ///
  /// [cells] is a list of flat cell indices forming the room.
  void sendRoomReveal(List<int> cells) =>
      _send({'type': 'vtt.roomReveal', 'cells': cells});

  /// Places a circle reveal in the TV's preview, or with [replaceLast]
  /// redraws the last one at a new radius ([VttState.previewCircle]).
  void sendCirclePreview(List<int> cells, {bool replaceLast = false}) => _send({
        'type': 'vtt.roomReveal',
        'cells': cells,
        'circle': replaceLast ? 'replace' : 'new',
      });

  // --- AoE templates (companion → table via relay) ---

  /// Places an area-of-effect template on the TV map.
  ///
  /// [aoeJson] is the serialized [AoeTemplate] (shape, origin, radius, angle).
  void sendSetAoe(Map<String, dynamic> aoeJson) =>
      _send({'type': 'vtt.setAoe', ...aoeJson});

  /// Removes the active area-of-effect template from the TV map.
  void sendClearAoe() => _send({'type': 'vtt.clearAoe'});

  // --- Ruler overlay (companion → table via relay) ---

  /// Toggles the L-shaped ruler overlay visibility on the TV.
  void sendToggleRuler() => _send({'type': 'vtt.toggleRuler'});

  /// Sets the ruler corner position to grid coordinates ([x], [y]).
  void sendSetRulerPosition(double x, double y) =>
      _send({'type': 'vtt.setRulerPosition', 'x': x, 'y': y});

  /// Rotates the ruler 90 degrees clockwise on the TV.
  void sendRotateRuler() => _send({'type': 'vtt.rotateRuler'});

  // --- AoE template disc (companion → table via relay) ---

  /// Sends the whole template disc ([TemplateDisc.toJson]) to the TV;
  /// [center] asks the TV to put it in the middle of its view. Sent for
  /// every change, drag moves included (a few hundred bytes).
  void sendSetTemplateDisc(Map<String, dynamic> disc, {bool center = false}) =>
      _send({
        'type': 'vtt.setTemplateDisc',
        'disc': disc,
        if (center) 'center': true,
      });

  /// Replaces the session's DM-only picture layer list on the TV
  /// (`vtt.setDmOverlays`). [overlays] are [DmOverlay.toJson] maps, bottom
  /// layer first; [rev] is the phone's edit revision the TV echoes back in
  /// `vtt.fullState` ([VttState.dmOverlaysRev]). The TV stores the list but
  /// never shows the pictures.
  void sendSetDmOverlays(List<Map<String, dynamic>> overlays, int rev) =>
      _send({'type': 'vtt.setDmOverlays', 'overlays': overlays, 'rev': rev});

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
  /// the TV side if omitted). If [settings] is provided, it is included
  /// as a JSON map so the TV initializes the session with those
  /// [SessionSettings].
  void sendNewSession(String mapId, {String? name, Map<String, dynamic>? settings}) {
    final msg = <String, dynamic>{'type': 'nav.newSession', 'mapId': mapId};
    if (name != null) msg['name'] = name;
    if (settings != null) msg['settings'] = settings;
    _send(msg);
  }

  /// Puts map [mapId] (a [MapLibraryEntry.id] on the TV) on the table in
  /// the running game (`vtt.switchMap`). The game's other maps keep their
  /// fog, tokens and drawings ([Session.switchTo]); a map new to the game
  /// joins it.
  void sendSwitchMap(String mapId) =>
      _send({'type': 'vtt.switchMap', 'mapId': mapId});

  /// Opens a map from the shared library (`lib.openSharedMap`): the TV
  /// downloads it unless it has it already ([MapLibraryEntry.serverMapId]),
  /// then adds it to the running game when [intoGame] is `true`, or starts
  /// a new game on it named [name] with [settings].
  ///
  /// [map] is the [SharedMap.toJson] of the library entry.
  void sendOpenSharedMap(Map<String, dynamic> map,
      {required bool intoGame, String? name, Map<String, dynamic>? settings}) {
    _send({
      'type': 'lib.openSharedMap',
      'map': map,
      'intoGame': intoGame,
      if (name != null) 'name': name,
      if (settings != null) 'settings': settings,
    });
  }

  /// Sends updated [SessionSettings] to the TV for the active session.
  ///
  /// [settings] is the serialized [SessionSettings.toJson] map. The TV
  /// applies these to the running session and broadcasts the change in
  /// the next `vtt.fullState`.
  void sendUpdateSessionSettings(Map<String, dynamic> settings) =>
      _send({'type': 'vtt.updateSessionSettings', 'settings': settings});

  /// Triggers a global visual effect on the TV.
  ///
  /// [effect] is one of `'flash'`, `'shake'`, `'fade'`, `'pulse'`, or
  /// `'danger'`. The TV's [GlobalEffectsComponent] renders the effect
  /// as a dramatic overlay or camera shake.
  void sendTriggerEffect(String effect) =>
      _send({'type': 'vtt.triggerEffect', 'effect': effect});

  // --- Library commands (companion → table) ---

  /// Requests the TV to send back a `lib.listing` with all maps and sessions.
  void sendRequestList() => _send({'type': 'lib.requestList'});

  /// Deletes the map identified by [mapId] from the TV's local library.
  void sendDeleteMap(String mapId) =>
      _send({'type': 'lib.deleteMap', 'mapId': mapId});

  /// Asks the TV for the thumbnail of library map [mapId]; the answer is a
  /// `lib.thumbnail` ([onThumbnail]). The TV ignores maps without one.
  void sendGetThumbnail(String mapId) =>
      _send({'type': 'lib.getThumbnail', 'mapId': mapId});

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
  /// and [camera] contains `x`, `y`, `zoom`, `angle`, plus the viewport
  /// size `vw`/`vh`, describing the current camera transform. This is
  /// called at up to 20 Hz from the TV's throttled broadcast timer.
  void sendFullState(Map<String, dynamic> stateJson, Map<String, double> camera) {
    final json = {
      'type': 'vtt.fullState',
      ...stateJson,
      'camera': camera,
      'sent': DateTime.now().millisecondsSinceEpoch,
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
        _forceReconnect('no data for ${elapsed.inSeconds}s');
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  // --- Connection management ---

  /// Handles the socket closing (by the relay, the network or an [error]):
  /// logs why and how long it lived, then reconnects.
  void _onDisconnect({Object? error}) {
    final wasRegistered = _registeredAt != null;
    RemoteLog.warn('relay', wasRegistered ? 'Relay connection lost' : 'Connect attempt ended', {
      'role': role,
      'closeCode': _channel?.closeCode,
      'closeReason': _channel?.closeReason,
      if (error != null) 'error': '$error',
      if (wasRegistered) 'upS': DateTime.now().difference(_registeredAt!).inSeconds,
      if (!wasRegistered) 'afterMs': _sinceMs(_attemptStartedAt),
      'lastDataAgoMs': DateTime.now().difference(_lastDataReceived).inMilliseconds,
      'state': _state.name,
    });
    if (wasRegistered) _lostAt ??= DateTime.now();
    _registeredAt = null;
    _connectTimer?.cancel();
    _stopHeartbeat();
    _subscription?.cancel();
    _subscription = null;
    _channel = null;
    _mapChunks = null;
    _mapChunksReceived = 0;
    if (!_intentionalClose && !_replaced) {
      _setState(RelayConnectionState.disconnected);
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_intentionalClose || _replaced) return;
    _reconnectTimer?.cancel();
    final backoffIndex = _reconnectAttempt.clamp(0, _backoffSeconds.length - 1);
    final delay = _backoffSeconds[backoffIndex];
    _reconnectAttempt++;
    debugPrint('VTT relay: reconnecting in ${delay}s (attempt $_reconnectAttempt)');
    RemoteLog.info('relay', 'Reconnect scheduled',
        {'role': role, 'delayS': delay, 'attempt': _reconnectAttempt});
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
    _stallTimer?.cancel();
    _connectTimer?.cancel();
    _lifecycle?.dispose();
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _stateController.close();
  }
}
