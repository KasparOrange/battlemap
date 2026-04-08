import 'dart:convert';

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

  /// Sends a message and returns whatever onCommand received, or `null` if
  /// the relay client handled the message internally instead of forwarding.
  Map<String, dynamic>? tryDispatch(Map<String, dynamic> msg) {
    Map<String, dynamic>? received;
    client.onCommand = (m) => received = m;
    client.handleIncomingMessage(jsonEncode(msg));
    return received;
  }

  /// Helper for the common positive case: sends a message and asserts that
  /// onCommand was invoked, returning the non-null payload.
  ///
  /// Use [tryDispatch] for negative tests where the message should NOT
  /// reach onCommand (e.g. it has an explicit case handler instead).
  Map<String, dynamic> dispatch(Map<String, dynamic> msg) {
    final received = tryDispatch(msg);
    if (received == null) {
      fail('Expected onCommand to be invoked for ${msg['type']}, but it was not');
    }
    return received;
  }

  group('vtt.editToken routes to onCommand', () {
    test('vtt.editToken with all fields', () {
      final received = dispatch({
        'type': 'vtt.editToken',
        'id': 'token_1',
        'name': 'Goblin',
        'maxHp': 20,
        'currentHp': 15,
        'conditions': ['poisoned', 'prone'],
      });

      expect(received, isNotNull);
      expect(received['type'], 'vtt.editToken');
      expect(received['id'], 'token_1');
      expect(received['name'], 'Goblin');
      expect(received['maxHp'], 20);
      expect(received['currentHp'], 15);
      expect(received['conditions'], ['poisoned', 'prone']);
    });
  });

  group('vtt.setMode routes to onCommand', () {
    test('vtt.setMode with measure', () {
      final received = dispatch({
        'type': 'vtt.setMode',
        'mode': 'measure',
      });

      expect(received, isNotNull);
      expect(received['type'], 'vtt.setMode');
      expect(received['mode'], 'measure');
    });

    test('vtt.setMode with roomReveal', () {
      final received = dispatch({
        'type': 'vtt.setMode',
        'mode': 'roomReveal',
      });

      expect(received, isNotNull);
      expect(received['type'], 'vtt.setMode');
      expect(received['mode'], 'roomReveal');
    });

    test('vtt.setMode with aoe', () {
      final received = dispatch({
        'type': 'vtt.setMode',
        'mode': 'aoe',
      });

      expect(received, isNotNull);
      expect(received['type'], 'vtt.setMode');
      expect(received['mode'], 'aoe');
    });
  });

  group('vtt.undo and vtt.redo route to onCommand', () {
    test('vtt.undo', () {
      final received = dispatch({'type': 'vtt.undo'});

      expect(received, isNotNull);
      expect(received['type'], 'vtt.undo');
    });

    test('vtt.redo', () {
      final received = dispatch({'type': 'vtt.redo'});

      expect(received, isNotNull);
      expect(received['type'], 'vtt.redo');
    });
  });

  group('shadow mode commands route to onCommand', () {
    test('vtt.toggleShadowMode', () {
      final received = dispatch({'type': 'vtt.toggleShadowMode'});

      expect(received, isNotNull);
      expect(received['type'], 'vtt.toggleShadowMode');
    });

    test('vtt.commitShadow', () {
      final received = dispatch({'type': 'vtt.commitShadow'});

      expect(received, isNotNull);
      expect(received['type'], 'vtt.commitShadow');
    });

    test('vtt.clearShadow', () {
      final received = dispatch({'type': 'vtt.clearShadow'});

      expect(received, isNotNull);
      expect(received['type'], 'vtt.clearShadow');
    });
  });

  group('vtt.roomReveal routes to onCommand', () {
    test('vtt.roomReveal with cells', () {
      final received = dispatch({
        'type': 'vtt.roomReveal',
        'cells': [0, 1, 2, 5, 6, 7],
      });

      expect(received, isNotNull);
      expect(received['type'], 'vtt.roomReveal');
      expect(received['cells'], [0, 1, 2, 5, 6, 7]);
    });
  });

  group('AoE commands route to onCommand', () {
    test('vtt.setAoe', () {
      final received = dispatch({
        'type': 'vtt.setAoe',
        'shape': 'circle',
        'originX': 5.0,
        'originY': 3.0,
        'radius': 4.0,
        'angle': 0.0,
      });

      expect(received, isNotNull);
      expect(received['type'], 'vtt.setAoe');
      expect(received['shape'], 'circle');
      expect(received['originX'], 5.0);
    });

    test('vtt.clearAoe', () {
      final received = dispatch({'type': 'vtt.clearAoe'});

      expect(received, isNotNull);
      expect(received['type'], 'vtt.clearAoe');
    });
  });

  group('patch.restart routes to onCommand', () {
    test('patch.restart', () {
      final received = dispatch({'type': 'patch.restart'});

      expect(received, isNotNull);
      expect(received['type'], 'patch.restart');
    });
  });

  group('commands with explicit case handling do NOT route to onCommand', () {
    test('vtt.fullState on table role does not call onCommand', () {
      // vtt.fullState is handled with an explicit case, not default
      final received = tryDispatch({
        'type': 'vtt.fullState',
        'showGrid': true,
        'fogEnabled': true,
      });

      // On table role, vtt.fullState is handled (role check fails),
      // but it's NOT forwarded to onCommand
      expect(received, isNull);
    });

    test('lib.listing does not route to onCommand', () {
      // lib.listing has an explicit case handler
      Map<String, dynamic>? libraryReceived;
      client.onLibraryListing = (msg) => libraryReceived = msg;

      final received = tryDispatch({
        'type': 'lib.listing',
        'maps': [],
        'sessions': [],
      });

      expect(received, isNull);
      expect(libraryReceived, isNotNull);
    });

    test('vtt.mapStart does not route to onCommand', () {
      final received = tryDispatch({
        'type': 'vtt.mapStart',
        'chunks': 1,
      });

      expect(received, isNull);
    });
  });
}
