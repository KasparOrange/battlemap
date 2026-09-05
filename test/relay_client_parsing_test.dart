import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/network/vtt_relay_client.dart';

/// Robustness tests for [VttRelayClient.handleIncomingMessage].
///
/// The relay client must never crash on malformed or unexpected input —
/// it sits behind a public WebSocket endpoint and any peer can send
/// arbitrary bytes. These tests assert that:
/// * malformed JSON is silently dropped
/// * messages missing required fields don't propagate to handlers
/// * unknown message types are forwarded to [VttRelayClient.onCommand]
/// * known types with wrong-shaped payloads don't crash the dispatcher
/// * role-gated handlers are skipped on the wrong role
///
/// All tests run against a fresh client per [setUp] / [tearDown] so state
/// doesn't leak between cases.
void main() {
  late VttRelayClient client;

  setUp(() {
    client = VttRelayClient(role: 'table');
  });

  tearDown(() {
    client.dispose();
  });

  /// Tracks whether [VttRelayClient.onCommand] fires for [msg], returning
  /// the captured payload (or `null` when nothing was forwarded).
  Map<String, dynamic>? capture(dynamic msg) {
    Map<String, dynamic>? received;
    client.onCommand = (m) => received = m;
    final encoded = msg is String ? msg : jsonEncode(msg);
    client.handleIncomingMessage(encoded);
    return received;
  }

  group('Malformed input is silently dropped', () {
    test('completely invalid JSON does not throw', () {
      expect(() => client.handleIncomingMessage('not json at all'),
          returnsNormally);
    });

    test('truncated JSON does not throw', () {
      expect(() => client.handleIncomingMessage('{"type":"vtt.toggleFog"'),
          returnsNormally);
    });

    test('JSON null does not throw', () {
      expect(() => client.handleIncomingMessage('null'), returnsNormally);
    });

    test('JSON array (not object) does not throw', () {
      expect(() => client.handleIncomingMessage('[1, 2, 3]'), returnsNormally);
    });

    test('JSON number does not throw', () {
      expect(() => client.handleIncomingMessage('42'), returnsNormally);
    });

    test('empty string does not throw', () {
      expect(() => client.handleIncomingMessage(''), returnsNormally);
    });
  });

  group('Missing required fields', () {
    test('object without "type" field is silently dropped', () {
      final received = capture({'foo': 'bar'});
      expect(received, isNull,
          reason: 'no type field means we cannot dispatch');
    });

    test('"type" field with non-string value is silently dropped', () {
      final received = capture({'type': 42, 'msg': 'hi'});
      expect(received, isNull);
    });

    test('"type" field that is null is silently dropped', () {
      final received = capture({'type': null});
      expect(received, isNull);
    });
  });

  group('Unknown message types fall through to onCommand', () {
    test('an entirely unknown type is forwarded as-is', () {
      final received = capture({
        'type': 'vtt.someBrandNewCommand',
        'data': 123,
      });
      expect(received, isNotNull);
      expect(received!['type'], 'vtt.someBrandNewCommand');
      expect(received['data'], 123);
    });

    test('namespaced future commands also fall through', () {
      final received = capture({'type': 'foo.bar.baz'});
      expect(received, isNotNull);
      expect(received!['type'], 'foo.bar.baz');
    });
  });

  group('Known types with wrong-shaped payloads do not crash', () {
    test('vtt.mapStart without chunks count is dropped, no crash', () {
      // Intentionally omits 'chunks'. Currently this throws inside the
      // handler but is caught by the outer try/catch — verify the client
      // does not propagate the error.
      expect(
        () => client.handleIncomingMessage(
            jsonEncode({'type': 'vtt.mapStart'})),
        returnsNormally,
      );
    });

    test('vtt.mapChunk before vtt.mapStart is silently ignored', () {
      // No mapStart was sent, so _mapChunks is null. The chunk is dropped.
      expect(
        () => client.handleIncomingMessage(jsonEncode({
          'type': 'vtt.mapChunk',
          'i': 0,
          'd': 'YWJj',
        })),
        returnsNormally,
      );
    });

    test('vtt.mapEnd before vtt.mapStart is silently ignored', () {
      expect(
        () => client.handleIncomingMessage(jsonEncode({
          'type': 'vtt.mapEnd',
        })),
        returnsNormally,
      );
    });

    test('update.progress without progress field is dropped, no crash', () {
      expect(
        () => client.handleIncomingMessage(jsonEncode({
          'type': 'update.progress',
        })),
        returnsNormally,
      );
    });

    test('update.progress with non-numeric progress is dropped, no crash', () {
      expect(
        () => client.handleIncomingMessage(jsonEncode({
          'type': 'update.progress',
          'progress': 'fifty percent',
        })),
        returnsNormally,
      );
    });
  });

  group('Role-gated dispatch', () {
    test('vtt.fullState on table role does NOT call onStateSync', () {
      // `client` is registered as table.
      Map<String, dynamic>? state;
      client.onStateSync = (m) => state = m;
      client.handleIncomingMessage(jsonEncode({
        'type': 'vtt.fullState',
        'showGrid': true,
      }));
      expect(state, isNull,
          reason: 'fullState only applies on companion side');
    });

    test('vtt.fullState on companion role DOES call onStateSync', () {
      final companion = VttRelayClient(role: 'companion');
      try {
        Map<String, dynamic>? state;
        companion.onStateSync = (m) => state = m;
        companion.handleIncomingMessage(jsonEncode({
          'type': 'vtt.fullState',
          'showGrid': true,
        }));
        expect(state, isNotNull);
        expect(state!['showGrid'], isTrue);
      } finally {
        companion.dispose();
      }
    });

    test('vtt.fullState on companion forwards camera if present', () {
      final companion = VttRelayClient(role: 'companion');
      try {
        double? cx;
        double? cy;
        double? cz;
        double? ca;
        companion.onCameraSync = (x, y, z, a, vw, vh) {
          cx = x;
          cy = y;
          cz = z;
          ca = a;
        };
        companion.handleIncomingMessage(jsonEncode({
          'type': 'vtt.fullState',
          'camera': {'x': 12.0, 'y': 34.0, 'zoom': 1.5, 'angle': 0.7},
        }));
        expect(cx, 12.0);
        expect(cy, 34.0);
        expect(cz, 1.5);
        expect(ca, 0.7);
      } finally {
        companion.dispose();
      }
    });

    test('vtt.fullState on companion without camera does not throw', () {
      final companion = VttRelayClient(role: 'companion');
      try {
        bool fired = false;
        companion.onCameraSync = (_, __, ___, ____, _____, ______) => fired = true;
        expect(
          () => companion.handleIncomingMessage(jsonEncode({
            'type': 'vtt.fullState',
            'showGrid': true,
          })),
          returnsNormally,
        );
        expect(fired, isFalse);
      } finally {
        companion.dispose();
      }
    });
  });

  group('Internal handlers do not leak to onCommand', () {
    test('vtt.mapStart is not forwarded as a generic command', () {
      final received = capture({'type': 'vtt.mapStart', 'chunks': 1});
      expect(received, isNull);
    });

    test('lib.listing is delivered to onLibraryListing, not onCommand', () {
      Map<String, dynamic>? listing;
      client.onLibraryListing = (m) => listing = m;
      final received = capture({
        'type': 'lib.listing',
        'maps': [],
        'sessions': [],
      });
      expect(received, isNull);
      expect(listing, isNotNull);
    });

    test('tv.error invokes onTvError with the message', () {
      String? err;
      client.onTvError = (m) => err = m;
      final received = capture({
        'type': 'tv.error',
        'msg': 'kaboom',
      });
      expect(received, isNull);
      expect(err, 'kaboom');
    });

    test('tv.error with missing msg falls back to "Unknown error"', () {
      String? err;
      client.onTvError = (m) => err = m;
      client.handleIncomingMessage(jsonEncode({'type': 'tv.error'}));
      expect(err, 'Unknown error');
    });

    test('tv.rendering passes active flag and label', () {
      bool? active;
      String? label;
      client.onTvRendering = (a, l) {
        active = a;
        label = l;
      };
      client.handleIncomingMessage(jsonEncode({
        'type': 'tv.rendering',
        'active': true,
        'label': 'Rendering PDF...',
      }));
      expect(active, isTrue);
      expect(label, 'Rendering PDF...');
    });

    test('tv.rendering without fields uses safe defaults', () {
      bool? active;
      String? label;
      client.onTvRendering = (a, l) {
        active = a;
        label = l;
      };
      client.handleIncomingMessage(jsonEncode({'type': 'tv.rendering'}));
      expect(active, isFalse);
      expect(label, '');
    });
  });

  group('Non-string raw input is dropped', () {
    test('passing a non-string raw value does not throw', () {
      // Internal _onData accepts dynamic; the public test entry forces
      // a String, but make sure the JSON path is robust to a [List]
      // wrapped as a string.
      expect(
        () => client.handleIncomingMessage(jsonEncode([1, 2, 3])),
        returnsNormally,
      );
    });
  });
}
