import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/network/vtt_relay_client.dart';

/// The relay client's connection diagnostics (MwLog tag `relay`): late
/// messages by their `sent` stamp, sends without a socket. 2026-10-10: a
/// minute of tablet commands reached the TV all at once after a reconnect.
void main() {
  late VttRelayClient client;

  setUp(() => client = VttRelayClient(role: 'table'));
  tearDown(() => client.dispose());

  int now() => DateTime.now().millisecondsSinceEpoch;

  test('a message stamped seconds ago counts as late and is still handled', () {
    final commands = <Map<String, dynamic>>[];
    client.onCommand = commands.add;

    client.handleIncomingMessage(jsonEncode(
        {'type': 'vtt.setTableWindow', 'col': 1, 'row': 2, 'sent': now() - 5000}));
    client.handleIncomingMessage(jsonEncode(
        {'type': 'vtt.setTableWindow', 'col': 2, 'row': 2, 'sent': now() - 4000}));

    expect(commands.length, 2);
    expect(commands.first['col'], 1);
    expect(client.diagnostics['lateCount'], 2);
    expect(client.diagnostics['lateMaxMs'], greaterThanOrEqualTo(5000));
  });

  test('an on-time message ends the late burst', () {
    client.handleIncomingMessage(
        jsonEncode({'type': 'vtt.toggleFog', 'sent': now() - 5000}));
    client.handleIncomingMessage(jsonEncode({'type': 'vtt.toggleFog', 'sent': now()}));

    expect(client.diagnostics['lateCount'], 0);
  });

  test('messages without a stamp (older builds) are never late', () {
    client.handleIncomingMessage(jsonEncode({'type': 'vtt.toggleFog'}));
    expect(client.diagnostics['lateCount'], 0);
  });

  test('sends without a socket are counted, a registration clears them', () {
    client.sendToggleFog();
    client.sendRevealAll();
    expect(client.diagnostics['droppedNoSocket'], 2);

    client.handleIncomingMessage(jsonEncode({'type': 'registered', 'paired': true}));
    expect(client.diagnostics['droppedNoSocket'], 0);
  });

  test('a ping without a socket is answered without throwing', () {
    client.handleIncomingMessage(jsonEncode({'type': 'ping', 'sent': now()}));
    client.handleIncomingMessage(jsonEncode({'type': 'pong', 't': now() - 40}));
    expect(client.diagnostics['droppedNoSocket'], 0); // pongs aren't commands
  });
}
