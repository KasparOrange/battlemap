import 'dart:convert';
import 'dart:typed_data';

import 'package:battlemap/game/dm_overlay_images.dart';
import 'package:battlemap/model/dm_overlay.dart';
import 'package:battlemap/model/session.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// A 1×1 PNG, small enough to decode in a unit test.
final _png = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

DmOverlay _layer(String id, {bool visible = true, double opacity = 0.6}) =>
    DmOverlay(id: id, name: '$id.png', url: 'http://vps/uploads/dm/$id.png',
        visible: visible, opacity: opacity);

/// A `vtt.fullState` as the TV sends it, carrying [layers] at [rev].
Map<String, dynamic> _tvState(List<DmOverlay> layers, int rev) {
  final tv = VttState()..setDmOverlaysFromRemote(layers, rev);
  return jsonDecode(jsonEncode(tv.toJson())) as Map<String, dynamic>;
}

/// DM-only picture layers (companion "Layers" tab): model, state edits,
/// the phone ↔ TV sync guard, session persistence, and the picture cache.
void main() {
  group('DmOverlay', () {
    test('JSON round trip', () {
      final o = _layer('a', visible: false, opacity: 0.25);
      expect(DmOverlay.fromJson(o.toJson()), o);
    });

    test('opacity is clamped, missing fields get defaults', () {
      expect(_layer('a', opacity: 3).opacity, 1.0);
      final o = DmOverlay.fromJson({'id': 'a', 'url': 'u'});
      expect(o.visible, isTrue);
      expect(o.opacity, DmOverlay.defaultOpacity);
      expect(o.name, 'Layer');
    });
  });

  group('VttState layer edits', () {
    test('add stacks on top, move clamps, remove + insert restores', () {
      final s = VttState();
      s.addDmOverlays([_layer('a'), _layer('b')]);
      s.addDmOverlays([_layer('c')]);
      expect(s.dmOverlays.map((o) => o.id), ['a', 'b', 'c']);

      s.moveDmOverlay('a', 1);
      expect(s.dmOverlays.map((o) => o.id), ['b', 'a', 'c']);
      s.moveDmOverlay('c', 5); // already on top
      expect(s.dmOverlays.map((o) => o.id), ['b', 'a', 'c']);
      s.moveDmOverlay('c', -9);
      expect(s.dmOverlays.map((o) => o.id), ['c', 'b', 'a']);

      final removed = s.removeDmOverlay('b')!;
      expect(removed.index, 1);
      expect(s.dmOverlays.map((o) => o.id), ['c', 'a']);
      s.insertDmOverlay(removed.index, removed.overlay);
      expect(s.dmOverlays.map((o) => o.id), ['c', 'b', 'a']);
      s.insertDmOverlay(0, _layer('b')); // duplicate id ignored
      expect(s.dmOverlays, hasLength(3));
    });

    test('edits are forwarded with a rising revision; previews are not', () {
      final s = VttState();
      final sent = <(List<String>, int)>[];
      s.onDmOverlaysChanged = (list, rev) => sent.add((list.map((o) => o.id).toList(), rev));

      s.addDmOverlays([_layer('a')]);
      s.setDmOverlayVisible('a', false);
      s.setDmOverlayOpacity('a', 0.3, forward: false);
      expect(s.dmOverlays.single.opacity, 0.3);
      s.setDmOverlayOpacity('a', 0.4);

      expect(sent, hasLength(3));
      expect(sent[1].$2, greaterThan(sent[0].$2));
      expect(sent[2].$2, greaterThan(sent[1].$2));
      expect(s.dmOverlaysRev, sent.last.$2);
    });

    test('master switch is local and survives a state sync', () {
      final s = VttState();
      s.toggleShowDmOverlays();
      expect(s.showDmOverlays, isFalse);
      s.applyRemoteState(_tvState([_layer('a')], 1));
      expect(s.showDmOverlays, isFalse);
    });

    test('a new map starts without layers', () {
      final s = VttState()..addDmOverlays([_layer('a')]);
      s.loadPdfAsMap(Uint8List(0),
          gridCols: 2, gridRows: 2, imageWidth: 100, imageHeight: 100);
      expect(s.dmOverlays, isEmpty);
      expect(s.dmOverlaysRev, 0);
    });
  });

  group('phone ↔ TV sync', () {
    test('the TV broadcasts its list and the phone takes it', () {
      final phone = VttState();
      phone.applyRemoteState(_tvState([_layer('a'), _layer('b')], 7));
      expect(phone.dmOverlays.map((o) => o.id), ['a', 'b']);
      expect(phone.dmOverlaysRev, 7);
    });

    test('a stale broadcast does not undo a local edit until the TV echoes it', () {
      final phone = VttState();
      phone.applyRemoteState(_tvState([_layer('a')], 0));
      phone.setDmOverlayVisible('a', false);
      final rev = phone.dmOverlaysRev;

      // Left the TV before the edit arrived: old list, old revision.
      phone.applyRemoteState(_tvState([_layer('a')], 0));
      expect(phone.dmOverlays.single.visible, isFalse);

      // The echo is taken …
      phone.applyRemoteState(_tvState([_layer('a', visible: false)], rev));
      expect(phone.dmOverlays.single.visible, isFalse);
      // … and from then on the TV's list again (e.g. a resumed session).
      phone.applyRemoteState(_tvState([_layer('x')], 0));
      expect(phone.dmOverlays.single.id, 'x');
    });

    test('a TV build without layers leaves the phone list alone', () {
      final phone = VttState()..addDmOverlays([_layer('a')]);
      final old = _tvState(const [], 0)
        ..remove('dmOverlays')
        ..remove('dmOverlaysRev');
      phone.applyRemoteState(old);
      expect(phone.dmOverlays.single.id, 'a');
    });
  });

  group('Session', () {
    Session session(List<Map<String, dynamic>> layers) => Session(
          id: 's',
          mapId: 'm',
          name: 'S',
          createdAt: DateTime(2026, 10, 10),
          lastModifiedAt: DateTime(2026, 10, 10),
          dmOverlayData: layers,
        );

    test('saves and restores the layer list', () {
      final json = jsonDecode(jsonEncode(session([_layer('a').toJson()]).toJson()));
      final back = Session.fromJson(json as Map<String, dynamic>);
      expect(DmOverlay.fromJson(back.dmOverlayData.single), _layer('a'));
    });

    test('older sessions without layers load with none', () {
      final json = session(const []).toJson()..remove('dmOverlayData');
      expect(Session.fromJson(json).dmOverlayData, isEmpty);
    });
  });

  group('DmOverlayImages', () {
    testWidgets('loads visible layers only, frees hidden ones, forgets removed ones',
        (tester) async {
      final requested = <String>[];
      final images = DmOverlayImages(download: (url) async {
        requested.add(url);
        return _png;
      });
      final a = _layer('a');
      final b = _layer('b', visible: false);

      await tester.runAsync(() async {
        images.sync([a, b], enabled: true);
        expect(images.statusOf('a'), DmOverlayImageStatus.loading);
        for (var i = 0; i < 50 && images.imageFor('a') == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      });
      expect(images.statusOf('a'), DmOverlayImageStatus.ready);
      expect(images.statusOf('b'), DmOverlayImageStatus.idle);
      expect(requested, [a.url]);

      images.sync([a.copyWith(visible: false), b], enabled: true);
      expect(images.imageFor('a'), isNull); // freed, bytes kept

      images.sync([a, b], enabled: false); // master switch off
      expect(images.statusOf('a'), DmOverlayImageStatus.idle);
      images.dispose();
    });

    testWidgets('a failed download is reported and retried when shown again',
        (tester) async {
      var fail = true;
      final images = DmOverlayImages(download: (url) async => fail ? null : _png);
      final a = _layer('a');
      await tester.runAsync(() async {
        images.sync([a], enabled: true);
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
      expect(images.statusOf('a'), DmOverlayImageStatus.failed);

      fail = false;
      images.sync([a.copyWith(visible: false)], enabled: true);
      await tester.runAsync(() async {
        images.sync([a], enabled: true);
        for (var i = 0; i < 50 && images.imageFor('a') == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      });
      expect(images.statusOf('a'), DmOverlayImageStatus.ready);
      images.dispose();
    });

    testWidgets('seeded bytes show without a download', (tester) async {
      final images = DmOverlayImages(download: (url) async => fail('no download expected'));
      final a = DmOverlay(id: 'a', name: 'a.png', url: 'local:a');
      images.put('a', _png);
      await tester.runAsync(() async {
        images.sync([a], enabled: true);
        for (var i = 0; i < 50 && images.imageFor('a') == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      });
      expect(images.statusOf('a'), DmOverlayImageStatus.ready);
      images.dispose();
    });
  });
}
