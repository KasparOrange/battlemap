import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/network/vtt_relay_client.dart';

void main() {
  late VttRelayClient client;

  setUp(() {
    client = VttRelayClient(role: 'table');
  });

  tearDown(() {
    client.dispose();
  });

  group('registered message', () {
    test('sets state to paired when paired=true', () async {
      final states = <RelayConnectionState>[];
      client.stateStream.listen(states.add);

      client.handleIncomingMessage(
          jsonEncode({'type': 'registered', 'paired': true}));

      expect(client.connectionState, RelayConnectionState.paired);

      // Stream events are delivered asynchronously — pump the microtask queue
      await Future<void>.delayed(Duration.zero);
      expect(states, contains(RelayConnectionState.paired));
    });

    test('sets state to connected when paired=false', () {
      client.handleIncomingMessage(
          jsonEncode({'type': 'registered', 'paired': false}));

      expect(client.connectionState, RelayConnectionState.connected);
    });
  });

  group('peer_connected / peer_disconnected', () {
    test('peer_connected sets state to paired', () {
      client.handleIncomingMessage(
          jsonEncode({'type': 'peer_connected'}));

      expect(client.connectionState, RelayConnectionState.paired);
    });

    test('peer_disconnected sets state to connected', () {
      // First become paired
      client.handleIncomingMessage(
          jsonEncode({'type': 'registered', 'paired': true}));
      expect(client.connectionState, RelayConnectionState.paired);

      client.handleIncomingMessage(
          jsonEncode({'type': 'peer_disconnected'}));

      expect(client.connectionState, RelayConnectionState.connected);
    });
  });

  group('chunked map transfer', () {
    test('mapStart + mapChunk + mapEnd assembles bytes and calls onMapLoaded',
        () {
      // Create some test data
      final testData = Uint8List.fromList([1, 2, 3, 4, 5, 6, 7, 8]);
      final b64 = base64Encode(testData);

      Uint8List? received;
      client.onMapLoaded = (bytes) {
        received = bytes;
      };

      // Send as a single chunk
      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapStart',
        'chunks': 1,
        'displayName': 'TestMap',
      }));

      expect(client.lastMapDisplayName, 'TestMap');

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapChunk',
        'i': 0,
        'd': b64,
      }));

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapEnd',
      }));

      expect(received, isNotNull);
      expect(received, equals(testData));
    });

    test('multi-chunk transfer works correctly', () {
      final testData = Uint8List.fromList(
          List.generate(100, (i) => i % 256));
      final b64 = base64Encode(testData);
      // Split into 2 chunks
      final mid = b64.length ~/ 2;
      final chunk0 = b64.substring(0, mid);
      final chunk1 = b64.substring(mid);

      Uint8List? received;
      client.onMapLoaded = (bytes) {
        received = bytes;
      };

      final progressValues = <double>[];
      client.onTransferProgress = (p) {
        progressValues.add(p);
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapStart',
        'chunks': 2,
      }));

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapChunk',
        'i': 0,
        'd': chunk0,
      }));

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapChunk',
        'i': 1,
        'd': chunk1,
      }));

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapEnd',
      }));

      expect(received, isNotNull);
      expect(received, equals(testData));
      // Progress should include: 0.0 (start), 0.5 (chunk 0), 1.0 (chunk 1),
      // null mapped to -1 (end)
      expect(progressValues, contains(0.0));
      expect(progressValues, contains(0.5));
      expect(progressValues, contains(1.0));
      expect(progressValues, contains(-1.0)); // transfer done signal
    });

    test('peer_disconnected discards partial transfer', () {
      Uint8List? received;
      client.onMapLoaded = (bytes) {
        received = bytes;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapStart',
        'chunks': 2,
      }));

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapChunk',
        'i': 0,
        'd': 'AAAA',
      }));

      // Peer disconnects mid-transfer
      client.handleIncomingMessage(
          jsonEncode({'type': 'peer_disconnected'}));

      // mapEnd arrives (shouldn't do anything)
      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.mapEnd',
      }));

      expect(received, isNull);
    });
  });

  group('vtt.fullState', () {
    test('calls onStateSync when role is companion', () {
      final companionClient = VttRelayClient(role: 'companion');
      addTearDown(companionClient.dispose);

      Map<String, dynamic>? receivedState;
      companionClient.onStateSync = (msg) {
        receivedState = msg;
      };

      double? camX, camY, camZoom, camAngle;
      companionClient.onCameraSync = (x, y, zoom, angle) {
        camX = x;
        camY = y;
        camZoom = zoom;
        camAngle = angle;
      };

      companionClient.handleIncomingMessage(jsonEncode({
        'type': 'vtt.fullState',
        'showGrid': true,
        'fogEnabled': false,
        'camera': {'x': 10.5, 'y': 20.3, 'zoom': 1.5, 'angle': 90.0},
      }));

      expect(receivedState, isNotNull);
      expect(receivedState!['showGrid'], true);
      expect(receivedState!['fogEnabled'], false);
      expect(camX, 10.5);
      expect(camY, 20.3);
      expect(camZoom, 1.5);
      expect(camAngle, 90.0);
    });

    test('does NOT call onStateSync when role is table', () {
      Map<String, dynamic>? receivedState;
      client.onStateSync = (msg) {
        receivedState = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.fullState',
        'showGrid': true,
        'fogEnabled': false,
      }));

      expect(receivedState, isNull);
    });
  });

  group('lib.listing', () {
    test('calls onLibraryListing', () {
      Map<String, dynamic>? received;
      client.onLibraryListing = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'lib.listing',
        'maps': [],
        'sessions': [],
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'lib.listing');
      expect(received!['maps'], []);
    });
  });

  group('update.versionInfo', () {
    test('calls onUpdateVersionInfo', () {
      Map<String, dynamic>? received;
      client.onUpdateVersionInfo = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'update.versionInfo',
        'currentVersion': '1.0.0',
        'latestVersion': '1.1.0',
      }));

      expect(received, isNotNull);
      expect(received!['currentVersion'], '1.0.0');
      expect(received!['latestVersion'], '1.1.0');
    });
  });

  group('update.progress', () {
    test('calls onUpdateProgress with progress and status', () {
      double? receivedProgress;
      String? receivedStatus;
      client.onUpdateProgress = (progress, status) {
        receivedProgress = progress;
        receivedStatus = status;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'update.progress',
        'progress': 0.75,
        'status': 'Downloading...',
      }));

      expect(receivedProgress, 0.75);
      expect(receivedStatus, 'Downloading...');
    });
  });

  group('default routing to onCommand', () {
    test('nav.* messages go to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'nav.goToLibrary',
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'nav.goToLibrary');
    });

    test('lib.requestList goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'lib.requestList',
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'lib.requestList');
    });

    test('vtt.toggleGrid goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.toggleGrid',
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'vtt.toggleGrid');
    });

    test('unknown message type goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'some.unknown.type',
        'data': 42,
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'some.unknown.type');
      expect(received!['data'], 42);
    });
  });

  group('new protocol commands route to onCommand', () {
    test('vtt.setMode goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.setMode',
        'mode': 'draw',
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'vtt.setMode');
      expect(received!['mode'], 'draw');
    });

    test('vtt.addToken goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.addToken',
        'gridX': 5,
        'gridY': 10,
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'vtt.addToken');
      expect(received!['gridX'], 5);
      expect(received!['gridY'], 10);
    });

    test('vtt.addStroke goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.addStroke',
        'stroke': {
          'points': [[1.0, 2.0], [3.0, 4.0]],
          'color': 'ffff0000',
          'width': 3.0,
        },
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'vtt.addStroke');
      expect(received!['stroke'], isA<Map>());
    });

    test('vtt.clearDrawings goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.clearDrawings',
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'vtt.clearDrawings');
    });

    test('vtt.moveToken goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.moveToken',
        'id': 'token-1',
        'gridX': 3,
        'gridY': 7,
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'vtt.moveToken');
      expect(received!['id'], 'token-1');
      expect(received!['gridX'], 3);
      expect(received!['gridY'], 7);
    });

    test('vtt.undoStroke goes to onCommand', () {
      Map<String, dynamic>? received;
      client.onCommand = (msg) {
        received = msg;
      };

      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.undoStroke',
      }));

      expect(received, isNotNull);
      expect(received!['type'], 'vtt.undoStroke');
    });
  });

  group('error handling', () {
    test('non-JSON input is silently ignored', () {
      // Should not throw
      client.handleIncomingMessage('not valid json');
    });

    test('non-string input is silently ignored by _onData', () {
      // The handleIncomingMessage wraps _onData which checks for String type
      // We can only pass strings through the public API, which is fine
      // This just verifies no crash on malformed JSON
      client.handleIncomingMessage('{"type": 123}');
    });
  });
}
