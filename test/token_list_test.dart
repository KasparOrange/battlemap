import 'package:battlemap/model/map_token.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Tokens off the map (created in the Tokens tab, placed later) and tokens
/// hidden from the players.
void main() {
  group('MapToken placed / hidden', () {
    test('round-trip keeps placed and hidden', () {
      final t = MapToken(
        id: 't1',
        label: '1',
        color: const Color(0xFFE53935),
        gridX: 2,
        gridY: 3,
        placed: false,
        hidden: true,
      );
      final back = MapToken.fromJson(t.toJson());
      expect(back.placed, isFalse);
      expect(back.hidden, isTrue);
    });

    test('older tokens without the fields are on the map and visible', () {
      final back = MapToken.fromJson({
        'id': 't1',
        'label': '1',
        'color': 'ffe53935',
        'gridX': 0,
        'gridY': 0,
      });
      expect(back.placed, isTrue);
      expect(back.hidden, isFalse);
    });
  });

  group('VttState tokens off the map', () {
    test('createToken makes a named token that is not on the map', () {
      final state = VttState();
      MapToken? sent;
      state.onTokenCreated = (t) => sent = t;
      state.createToken(name: 'Thorin');
      expect(state.tokens.single.placed, isFalse);
      expect(state.tokens.single.name, 'Thorin');
      expect(sent?.name, 'Thorin');
      expect(state.canUndo, isTrue);
    });

    test('moveToken places it; undo takes it off again, redo back', () {
      final state = VttState()..createToken(name: 'Goblin');
      final id = state.tokens.single.id;
      state.setPlacingToken(id);
      state.moveToken(id, 4, 5);
      final t = state.tokens.single;
      expect((t.placed, t.gridX, t.gridY), (true, 4, 5));
      expect(state.placingTokenId, isNull);

      state.undo();
      expect(state.tokens.single.placed, isFalse);
      state.redo();
      expect(state.tokens.single.placed, isTrue);
    });

    test('labels stay unique after a delete', () {
      final state = VttState()
        ..createToken()
        ..createToken();
      state.removeToken(state.tokens.first.id);
      state.createToken();
      expect(state.tokens.map((t) => t.label).toSet().length, 2);
    });

    test('setTokenHidden flips the flag and reports it', () {
      final state = VttState()..addToken(1, 1);
      final id = state.tokens.single.id;
      (String, bool)? sent;
      state.onTokenHiddenChanged = (i, h) => sent = (i, h);
      state.setTokenHidden(id, true);
      expect(state.tokens.single.hidden, isTrue);
      expect(sent, (id, true));
    });

    test('a synced state without the armed token cancels placing', () {
      final state = VttState()..createToken();
      state.setPlacingToken(state.tokens.single.id);
      state.applyRemoteState(VttState().toJson()..['tokens'] = <dynamic>[]);
      expect(state.placingTokenId, isNull);
    });
  });
}
