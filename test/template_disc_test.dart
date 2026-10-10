import 'dart:io';
import 'dart:math';
import 'dart:ui';

import 'package:battlemap/game/components/template_disc_component.dart';
import 'package:battlemap/model/session.dart';
import 'package:battlemap/model/template_disc.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:battlemap/ui/template_disc_panel.dart';
import 'package:flame/components.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// The AoE template disc: the acrylic disc's geometry, its JSON, the
/// state's echo guard, the session, the renderer and the Measure tab panel.
void main() {
  group('TemplateDisc.classic — the photo', () {
    final d = TemplateDisc.classic();

    test('rings, cubes and cones of the acrylic disc', () {
      expect(d.rings.sizes, [5, 10, 15, 20]);
      expect(d.cubes.sizes, [10, 20, 30]);
      expect(d.cones.sizes, [15, 30]);
      expect(d.cubes.line, DiscLineStyle.dotted);
      expect(d.cones.line, DiscLineStyle.dotted);
      expect(d.rings.line, DiscLineStyle.solid);
      expect(d.visible, isFalse);
    });

    test('cones share one base; the 30 ft cone is centred, the 15 ft tip is the middle', () {
      final c30 = d.coneTriangle(30);
      final c15 = d.coneTriangle(15);
      expect(c30[0].dx, closeTo(3, 1e-9)); // tip 15 ft east
      expect(c30[1].dx, closeTo(-3, 1e-9)); // base 15 ft west
      expect(c15[0], const Offset(0, 0));
      expect(c15[1].dx, closeTo(-3, 1e-9)); // same base line
      // 5e cone: as wide as it is long
      expect((c30[2].dy - c30[1].dy), closeTo(6, 1e-9));
      expect((c15[2].dy - c15[1].dy), closeTo(3, 1e-9));
    });

    test('the edge sits just outside the 30 ft cube corners (~21.2 ft)', () {
      expect(d.reach, closeTo(3 * sqrt2, 1e-9));
      expect(d.rimRadius, closeTo(3 * sqrt2 + TemplateDisc.rimMargin, 1e-9));
    });

    test('12 compass marks, the one under the ring labels left out', () {
      final a = d.markerAngles;
      expect(a, hasLength(11));
      expect(a.any((x) => (x - 3 * pi / 2).abs() < 1e-9), isFalse);
      expect(d.markerRadius, closeTo(3.5, 1e-9)); // between 15 and 20 ft
    });
  });

  group('TemplateDisc', () {
    test('cones from the middle start at the middle', () {
      final d = TemplateDisc.classic().copyWith(coneAnchor: DiscConeAnchor.center);
      expect(d.coneTriangle(30)[0], const Offset(0, 0));
      expect(d.coneTriangle(30)[1].dx, closeTo(-6, 1e-9));
    });

    test('rotation is normalised to 0..360', () {
      expect(TemplateDisc.classic().copyWith(rotation: -15).rotation, 345);
      expect(TemplateDisc.classic().copyWith(rotation: 375).rotation, 15);
    });

    test('toMap turns and moves a point of the disc', () {
      final d = TemplateDisc.classic().copyWith(x: 10, y: 5, rotation: 90);
      final p = d.toMap(const Offset(1, 0));
      expect(p.dx, closeTo(10, 1e-9));
      expect(p.dy, closeTo(6, 1e-9));
      // The knob sits west, on the cones' open side
      expect(d.knobLocal.dx, closeTo(-d.rimRadius, 1e-9));
    });

    test('snap to square middles and corners', () {
      final base = TemplateDisc.classic();
      const p = Offset(3.3, 7.8);
      expect(base.snapped(p), p);
      expect(base.copyWith(snap: DiscSnap.squareCenters).snapped(p),
          const Offset(3.5, 7.5));
      expect(base.copyWith(snap: DiscSnap.squareCorners).snapped(p),
          const Offset(3, 8));
    });

    test('sizes are sorted and deduplicated', () {
      final set = TemplateDisc.classic().rings.copyWith(sizes: [20, 5, 20, 0, 10]);
      expect(set.sizes, [5, 10, 20]);
    });

    test('JSON round trip keeps place and look', () {
      final d = TemplateDisc.classic().copyWith(
        visible: true,
        x: 4.5,
        y: 2,
        rotation: 30,
        rings: TemplateDisc.classic().rings.copyWith(sizes: [10, 40], color: 0xFFFFFFFF),
        coneAnchor: DiscConeAnchor.center,
        coneDegrees: 90,
        markers: 8,
        tint: 0.25,
        snap: DiscSnap.squareCorners,
      );
      final back = TemplateDisc.fromJson(d.toJson());
      expect(back.toJson(), d.toJson());
      expect(back.shapeKey, d.shapeKey);
    });

    test('unreadable JSON falls back to the classic disc', () {
      expect(TemplateDisc.fromJson(null).shapeKey, TemplateDisc.classic().shapeKey);
      expect(TemplateDisc.fromJson({'markers': 'x'.length * 999}).markers, 36);
    });

    test('withShapeOf keeps the place, takes the look', () {
      final here = TemplateDisc.classic().copyWith(visible: true, x: 7, y: 3, rotation: 45);
      final look = TemplateDisc.classic().copyWith(markers: 4, x: 99);
      final d = here.withShapeOf(look);
      expect(d.markers, 4);
      expect([d.visible, d.x, d.y, d.rotation], [true, 7, 3, 45]);
    });

    test('shapeKey ignores the place', () {
      final d = TemplateDisc.classic();
      expect(d.copyWith(x: 5, rotation: 90).shapeKey, d.shapeKey);
      expect(d.copyWith(markers: 4).shapeKey, isNot(d.shapeKey));
    });
  });

  group('VttState', () {
    test('setTemplateDisc fires the relay hook with center', () {
      final state = VttState();
      final sent = <(TemplateDisc, bool)>[];
      state.onTemplateDiscChanged = (d, c) => sent.add((d, c));
      state.setTemplateDisc(state.templateDisc.copyWith(visible: true), center: true);
      expect(state.templateDisc.visible, isTrue);
      expect(sent.single.$2, isTrue);
    });

    test('the TV echo of an older position does not pull back a drag', () {
      final tv = VttState()
        ..templateDisc = TemplateDisc.classic().copyWith(visible: true, x: 1, y: 1);
      final echo = tv.toJson();
      final tablet = VttState();
      tablet.setTemplateDisc(TemplateDisc.classic().copyWith(visible: true, x: 5, y: 5));
      tablet.applyRemoteState(echo);
      expect(tablet.templateDisc.x, 5);
    });

    test('after asking the TV to centre it, the tablet takes its answer', () {
      final tv = VttState()
        ..templateDisc = TemplateDisc.classic().copyWith(visible: true, x: 12, y: 8);
      final tablet = VttState();
      tablet.setTemplateDisc(TemplateDisc.classic().copyWith(visible: true), center: true);
      tablet.applyRemoteState(tv.toJson());
      expect([tablet.templateDisc.x, tablet.templateDisc.y], [12, 8]);
    });

    test('an older TV without the disc leaves it alone', () {
      final json = VttState().toJson()..remove('templateDisc');
      final tablet = VttState()
        ..templateDisc = TemplateDisc.classic().copyWith(markers: 4);
      tablet.applyRemoteState(json);
      expect(tablet.templateDisc.markers, 4);
    });
  });

  group('Session', () {
    Session game() => Session(
          id: 's',
          mapId: 'a',
          name: 'g',
          createdAt: DateTime(2026),
          lastModifiedAt: DateTime(2026),
          templateDisc: TemplateDisc.classic()
              .copyWith(visible: true, x: 3, markers: 8)
              .toJson(),
        );

    test('round trip', () {
      final back = Session.fromJson(game().toJson());
      expect(TemplateDisc.fromJson(back.templateDisc).markers, 8);
      expect(back.templateDisc!['visible'], isTrue);
    });

    test('belongs to the map: parked on a switch, back on return', () {
      final other = game().switchTo('b');
      expect(other.templateDisc, isNull);
      final back = other.switchTo('a');
      expect(TemplateDisc.fromJson(back.templateDisc).x, 3);
    });

    test('older sessions have none', () {
      final json = game().toJson()..remove('templateDisc');
      expect(Session.fromJson(json).templateDisc, isNull);
    });
  });

  group('TemplateDiscComponent', () {
    for (final handles in [false, true]) {
      test('renders every option without throwing (handles: $handles)', () {
        final state = VttState()
          ..templateDisc = TemplateDisc.classic().copyWith(
              visible: true, x: 5, y: 5, rotation: 200, tint: 0.25);
        final c = TemplateDiscComponent(
          state: state,
          pixelsPerGrid: 100,
          mapSize: Vector2(1000, 1000),
          showHandles: handles,
          viewAngle: () => pi / 2,
        );
        final recorder = PictureRecorder();
        final canvas = Canvas(recorder);
        c.render(canvas);
        // A look change rebuilds; hidden draws nothing
        state.templateDisc = state.templateDisc.copyWith(
            coneAnchor: DiscConeAnchor.center, markers: 0, centerMark: false,
            cubes: state.templateDisc.cubes.copyWith(visible: false));
        c.render(canvas);
        state.templateDisc = state.templateDisc.copyWith(visible: false);
        c.render(canvas);
        recorder.endRecording().dispose();
      });
    }

    test('dotted cuts a closed outline into whole dots', () {
      final path = Path()..addRect(const Rect.fromLTWH(0, 0, 100, 100));
      final dots = TemplateDiscComponent.dotted(path, 5);
      final metrics = dots.computeMetrics().toList();
      expect(metrics, hasLength(40)); // 400 long / 10 per dot+gap
      expect(metrics.first.length, closeTo(5, 1e-6));
    });
  });

  group('TemplateDiscPanel', () {
    setUp(() => TemplateDiscStore.memory = {});
    tearDown(() => TemplateDiscStore.memory = null);

    Future<List<(TemplateDisc, bool)>> pump(
        WidgetTester tester, TemplateDisc disc) async {
      final calls = <(TemplateDisc, bool)>[];
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: SizedBox(
              width: 320,
              child: TemplateDiscPanel(
                disc: disc,
                onChanged: (d, {bool center = false}) => calls.add((d, center)),
              ),
            ),
          ),
        ),
      ));
      await tester.pump();
      return calls;
    }

    testWidgets('showing it asks the TV to centre it', (tester) async {
      final calls = await pump(tester, TemplateDisc.classic());
      await tester.tap(find.text('Template disc on the map'));
      expect(calls.single.$1.visible, isTrue);
      expect(calls.single.$2, isTrue);
    });

    testWidgets('turn buttons turn by 15°', (tester) async {
      final calls =
          await pump(tester, TemplateDisc.classic().copyWith(visible: true));
      await tester.tap(find.byIcon(Icons.rotate_right));
      expect(calls.single.$1.rotation, 15);
      await tester.tap(find.byIcon(Icons.rotate_left));
      expect(calls.last.$1.rotation, 345);
    });

    testWidgets('the shape editor changes sizes and options', (tester) async {
      final calls =
          await pump(tester, TemplateDisc.classic().copyWith(visible: true));
      await tester.tap(find.text('Shape'));
      await tester.pumpAndSettle();
      // Add a ring: the next five feet up
      await tester.tap(find.byIcon(Icons.add).first);
      expect(calls.last.$1.rings.sizes, [5, 10, 15, 20, 25]);
      await tester.ensureVisible(find.text('From the middle'));
      await tester.tap(find.text('From the middle'));
      expect(calls.last.$1.coneAnchor, DiscConeAnchor.center);
      await tester.ensureVisible(find.text('Reset to defaults'));
      await tester.tap(find.text('Reset to defaults'));
      await tester.pump();
      expect(calls.last.$1.shapeKey, TemplateDisc.classic().shapeKey);
      expect(calls.last.$1.visible, isTrue);
    });

    testWidgets('reset to defaults can be undone', (tester) async {
      final custom = TemplateDisc.classic().copyWith(visible: true, markers: 4);
      final calls = await pump(tester, custom);
      await tester.tap(find.text('Shape'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Reset to defaults'));
      await tester.pump();
      expect(calls.last.$1.markers, 12);
      await tester.tap(find.text('Undo reset'));
      await tester.pump();
      expect(calls.last.$1.markers, 4);
      expect(find.text('Undo reset'), findsNothing);
    });

    testWidgets('the look saved on the tablet comes back after a restart',
        (tester) async {
      final look = TemplateDisc.classic().copyWith(markers: 8, tint: 0.25);
      await TemplateDiscStore.save(look);
      // A resumed game shows the disc with another look
      final calls = await pump(
          tester, TemplateDisc.classic().copyWith(visible: true, x: 7, y: 2));
      await tester.pump();
      await tester.pump();
      expect(calls, isNotEmpty);
      final d = calls.last.$1;
      expect(d.shapeKey, look.shapeKey);
      expect([d.visible, d.x, d.y], [true, 7, 2]);
      expect(calls.last.$2, isFalse);
    });

    testWidgets('showing a hidden disc uses the saved look', (tester) async {
      final look = TemplateDisc.classic().copyWith(markers: 0);
      await TemplateDiscStore.save(look);
      final calls = await pump(tester, TemplateDisc.classic());
      await tester.pump();
      expect(calls, isEmpty); // hidden: nothing pushed
      await tester.tap(find.text('Template disc on the map'));
      expect(calls.single.$1.markers, 0);
      expect(calls.single.$2, isTrue);
    });
  });

  group('TemplateDiscStore (Hive)', () {
    late Directory dir;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('template_disc_store');
      Hive.init(dir.path);
    });
    tearDown(() async {
      await Hive.close();
      dir.deleteSync(recursive: true);
    });

    test('a saved look survives closing and reopening the store', () async {
      expect(await TemplateDiscStore.load(), isNull);
      final look = TemplateDisc.classic().copyWith(
          markers: 4, coneAnchor: DiscConeAnchor.center, x: 9, visible: true);
      await TemplateDiscStore.save(look);
      await Hive.close(); // the app closes
      Hive.init(dir.path); // and starts again
      final back = await TemplateDiscStore.load();
      expect(back!.shapeKey, look.shapeKey);
      expect([back.visible, back.x], [false, 0]); // the look only
    });
  });
}
