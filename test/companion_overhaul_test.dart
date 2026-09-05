import 'dart:convert';

import 'package:battlemap/game/components/tv_viewport_component.dart';
import 'package:battlemap/model/aoe_template.dart';
import 'package:battlemap/network/vtt_relay_client.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// Tests for the companion overhaul (docs/action.md 2026-09-06): synced
/// undo flags, measure line in the state, AoE tool settings, ruler and
/// AoE relay callbacks, camera snapshot parsing, and the new relay
/// commands.
void main() {
  group('undo/redo availability mirrors the TV', () {
    test('local stack is used until a remote state arrives', () {
      final state = VttState();
      expect(state.canUndo, isFalse);
      state.toggleReveal(3);
      expect(state.canUndo, isTrue);
    });

    test('remote canUndo/canRedo override the local stack', () {
      final state = VttState();
      state.toggleReveal(3); // local stack non-empty
      final json = VttState().toJson()
        ..['canUndo'] = false
        ..['canRedo'] = true;
      state.applyRemoteState(json);
      expect(state.canUndo, isFalse);
      expect(state.canRedo, isTrue);
    });

    test('older TV builds without the flags keep the local stack', () {
      final state = VttState();
      state.toggleReveal(3);
      final json = VttState().toJson()
        ..remove('canUndo')
        ..remove('canRedo');
      state.applyRemoteState(json);
      expect(state.canUndo, isTrue);
    });

    test('toJson carries canUndo/canRedo', () {
      final state = VttState();
      state.toggleReveal(1);
      state.undo();
      final json = state.toJson();
      expect(json['canUndo'], isFalse);
      expect(json['canRedo'], isTrue);
    });
  });

  group('measure line in the state', () {
    test('setMeasure stores, notifies and forwards', () {
      final state = VttState();
      Offset? fs, fe;
      var notified = 0;
      state.addListener(() => notified++);
      state.onMeasureChanged = (s, e) {
        fs = s;
        fe = e;
      };
      state.setMeasure(const Offset(10, 20), const Offset(30, 40));
      expect(state.measureStart, const Offset(10, 20));
      expect(state.measureEnd, const Offset(30, 40));
      expect(fs, const Offset(10, 20));
      expect(fe, const Offset(30, 40));
      expect(notified, 1);

      state.clearMeasure();
      expect(state.measureStart, isNull);
      expect(fs, isNull);
      expect(fe, isNull);
    });

    test('round-trips through toJson/applyRemoteState', () {
      final state = VttState();
      state.setMeasure(const Offset(1.5, 2.5), const Offset(3.5, 4.5));
      final json = jsonDecode(jsonEncode(state.toJson())) as Map<String, dynamic>;
      expect(json['measure'], isNotNull);

      final restored = VttState();
      restored.applyRemoteState(json);
      expect(restored.measureStart, const Offset(1.5, 2.5));
      expect(restored.measureEnd, const Offset(3.5, 4.5));

      // Cleared on the TV → cleared on the phone
      state.clearMeasure();
      restored.applyRemoteState(state.toJson());
      expect(restored.measureStart, isNull);
      expect(restored.measureEnd, isNull);
    });

    test('clearMap drops the measurement and the AoE', () {
      final state = VttState();
      state.setMeasure(const Offset(1, 1), const Offset(2, 2));
      state.setAoe(AoeTemplate(shape: AoeShape.cone, originX: 1, originY: 1, radius: 3));
      state.clearMap();
      expect(state.measureStart, isNull);
      expect(state.activeAoe, isNull);
    });
  });

  group('AoE tool settings', () {
    test('defaults are a 20 ft circle and survive remote state', () {
      final state = VttState();
      expect(state.aoeShape, AoeShape.circle);
      expect(state.aoeRadius, 4);
      state.setAoeTool(AoeShape.line, 12);
      state.applyRemoteState(VttState().toJson());
      expect(state.aoeShape, AoeShape.line);
      expect(state.aoeRadius, 12);
      expect(state.toJson().containsKey('aoeShape'), isFalse);
    });

    test('setAoe/clearAoe forward through onAoeChanged', () {
      final state = VttState();
      final seen = <AoeTemplate?>[];
      state.onAoeChanged = seen.add;
      state.setAoe(AoeTemplate(shape: AoeShape.square, originX: 2, originY: 3, radius: 1));
      state.clearAoe();
      expect(seen.length, 2);
      expect(seen[0]!.shape, AoeShape.square);
      expect(seen[1], isNull);
    });
  });

  group('ruler', () {
    test('setRulerPosition forwards through onRulerMoved', () {
      final state = VttState();
      double? rx, ry;
      state.onRulerMoved = (x, y) {
        rx = x;
        ry = y;
      };
      state.setRulerPosition(3.25, 7.5);
      expect(rx, 3.25);
      expect(ry, 7.5);
    });
  });

  group('defaults fixed by the overhaul', () {
    test('drawWidth default matches the M preset', () {
      expect(VttState().drawWidth, 4.0);
    });

    test('shadowMode defaults to false locally and remotely', () {
      final state = VttState();
      expect(state.shadowMode, isFalse);
      final json = VttState().toJson()..remove('shadowMode');
      state.applyRemoteState(json);
      expect(state.shadowMode, isFalse);
    });
  });

  group('CameraSnapshot', () {
    test('parses vw/vh and tolerates their absence', () {
      final full = CameraSnapshot.fromJson(
          {'x': 1, 'y': 2, 'zoom': 0.5, 'angle': 0, 'vw': 1920, 'vh': 1080});
      expect(full.vw, 1920);
      expect(full.vh, 1080);
      final old = CameraSnapshot.fromJson({'x': 1, 'y': 2, 'zoom': 0.5, 'angle': 0});
      expect(old.vw, 0);
      expect(old.differsFrom(full), isTrue);
      expect(full.differsFrom(CameraSnapshot.fromJson(full.toJson())), isFalse);
    });
  });

  group('relay: new messages', () {
    late VttRelayClient companion;

    setUp(() => companion = VttRelayClient(role: 'companion'));
    tearDown(() => companion.dispose());

    test('vtt.fullState delivers viewport size to onCameraSync', () {
      double? vw, vh;
      companion.onCameraSync = (x, y, z, a, w, h) {
        vw = w;
        vh = h;
      };
      companion.onStateSync = (_) {};
      final msg = VttState().toJson()
        ..['type'] = 'vtt.fullState'
        ..['camera'] = {'x': 0, 'y': 0, 'zoom': 1, 'angle': 0, 'vw': 800, 'vh': 600};
      companion.handleIncomingMessage(jsonEncode(msg));
      expect(vw, 800);
      expect(vh, 600);
    });

    test('vtt.setCamera and vtt.setMeasure reach the table dispatcher', () {
      final table = VttRelayClient(role: 'table');
      final received = <Map<String, dynamic>>[];
      table.onCommand = received.add;
      table.handleIncomingMessage(jsonEncode(
          {'type': 'vtt.setCamera', 'x': 10, 'y': 20, 'zoom': 0.7, 'angle': 0}));
      table.handleIncomingMessage(jsonEncode(
          {'type': 'vtt.setMeasure', 'x1': 1, 'y1': 2, 'x2': 3, 'y2': 4}));
      table.handleIncomingMessage(jsonEncode({'type': 'vtt.setMeasure'}));
      expect(received.map((m) => m['type']).toList(),
          ['vtt.setCamera', 'vtt.setMeasure', 'vtt.setMeasure']);
      expect(received[1]['x2'], 3);
      expect(received[2].containsKey('x1'), isFalse);
      table.dispose();
    });
  });
}
