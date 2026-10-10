import 'dart:convert';

import 'package:battlemap/network/vtt_relay_client.dart';
import 'package:battlemap/update/deploy_restore.dart';
import 'package:flutter_test/flutter_test.dart';

/// Rolling deploy (tools/deploy.sh): launch routes, the TV's restore
/// snapshot, and the relay messages around it.
void main() {
  group('DeployRestore.parseRoute', () {
    test('normal launch restores nothing', () {
      expect(DeployRestore.parseRoute('/'), isNull);
      expect(DeployRestore.parseRoute(''), isNull);
      expect(DeployRestore.parseRoute(null), isNull);
      expect(DeployRestore.parseRoute('/other'), isNull);
    });

    test('/restore opens the TV, with or without a named session', () {
      final plain = DeployRestore.parseRoute('/restore')!;
      expect(plain.tv, isTrue);
      expect(plain.sessionId, isNull);

      final named = DeployRestore.parseRoute('/restore?session=s1&map=m1')!;
      expect(named.tv, isTrue);
      expect(named.sessionId, 's1');
      expect(named.mapId, 'm1');

      expect(DeployRestore.parseRoute('/restore?session=')!.sessionId, isNull);
    });

    test('/companion opens the networked companion', () {
      expect(DeployRestore.parseRoute('/companion')!.tv, isFalse);
    });
  });

  group('restore snapshot', () {
    test('a game snapshot names its session', () {
      final t = DeployRestore.decode(
          DeployRestore.encode(view: 'game', mapId: 'm1', sessionId: 's1'))!;
      expect(t.tv, isTrue);
      expect(t.sessionId, 's1');
      expect(t.mapId, 'm1');
    });

    test('outside a game there is nothing to reopen', () {
      expect(DeployRestore.decode(DeployRestore.encode(view: 'library')), isNull);
      expect(DeployRestore.decode(null), isNull);
    });
  });

  group('relay', () {
    test('a companion taking over the slot asks the TV to resend', () {
      final tv = VttRelayClient(role: 'table');
      var resends = 0;
      tv.onPeerReconnected = () => resends++;

      tv.handleIncomingMessage(jsonEncode({'type': 'peer_connected'}));
      expect(resends, 0); // first pairing: the state change handles it

      tv.handleIncomingMessage(jsonEncode({'type': 'peer_connected'}));
      expect(resends, 1);
      expect(tv.connectionState, RelayConnectionState.paired);
      tv.dispose();
    });

    test('deploy.ready reaches the companion, not onCommand', () {
      final phone = VttRelayClient(role: 'companion');
      Map<String, dynamic>? ready;
      final commands = <Map<String, dynamic>>[];
      phone.onDeployReady = (m) => ready = m;
      phone.onCommand = commands.add;

      phone.handleIncomingMessage(
          jsonEncode({'type': 'deploy.ready', 'sessionId': 's1'}));
      expect(ready?['sessionId'], 's1');
      expect(commands, isEmpty);
      phone.dispose();
    });
  });
}
