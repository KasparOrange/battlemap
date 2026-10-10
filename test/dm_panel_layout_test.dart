import 'package:battlemap/state/vtt_state.dart';
import 'package:battlemap/ui/dm_control_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The DM panel's two layouts (bottom sheet, side rail on a landscape
/// tablet) and the Fog tab's controls.
void main() {
  group('DmControlPanel.sideLayoutFor', () {
    test('landscape tablet docks at the side', () {
      expect(DmControlPanel.sideLayoutFor(const Size(1280, 800)), isTrue);
    });

    test('portrait tablet keeps the bottom sheet', () {
      expect(DmControlPanel.sideLayoutFor(const Size(800, 1280)), isFalse);
    });

    test('landscape phone keeps the bottom sheet (too short for a rail)', () {
      expect(DmControlPanel.sideLayoutFor(const Size(844, 390)), isFalse);
    });
  });

  group('panel', () {
    late List<String> calls;

    DmCallbacks callbacks() {
      void Function() rec(String name) => () => calls.add(name);
      return DmCallbacks(
        onLoadMap: rec('loadMap'),
        onToggleFog: rec('toggleFog'),
        onRevealAll: rec('revealAll'),
        onHideAll: rec('hideAll'),
        onToggleGrid: rec('toggleGrid'),
        onToggleWalls: rec('toggleWalls'),
        onToggleRevealMode: rec('toggleRevealMode'),
        onSetBrushRadius: (_) => calls.add('brushRadius'),
        onZoomIn: rec('zoomIn'),
        onZoomOut: rec('zoomOut'),
        onZoomToFit: rec('zoomToFit'),
        onRotateCW: rec('rotateCW'),
        onRotateCCW: rec('rotateCCW'),
        onResetRotation: rec('resetRotation'),
        onCalibrate: (_) => calls.add('calibrate'),
        onResetCalibration: rec('resetCalibration'),
        onSetFogMode: rec('fogMode'),
        onSetDrawMode: rec('drawMode'),
        onSetTokenMode: rec('tokenMode'),
        onSetMeasureMode: rec('measureMode'),
        onSetDrawColor: (_) => calls.add('drawColor'),
        onSetDrawWidth: (_) => calls.add('drawWidth'),
        onClearDrawings: rec('clearDrawings'),
        onUndoStroke: rec('undoStroke'),
        onClearTokens: rec('clearTokens'),
        onEditToken: (id, {name, maxHp, currentHp, conditions}) =>
            calls.add('editToken'),
        onRemoveToken: (id) => calls.add('remove $id'),
        onCreateToken: (name) => calls.add('create $name'),
        onSetTokenHidden: (id, hidden) => calls.add('hidden $id $hidden'),
        onFocusToken: (t) => calls.add('focus ${t.id}'),
        onUndo: rec('undo'),
        onRedo: rec('redo'),
        onToggleShadowMode: rec('toggleShadow'),
        onCommitShadow: rec('commitShadow'),
        onClearShadow: rec('clearShadow'),
        onSetRoomRevealMode: rec('roomMode'),
        onRoomReveal: (_) => calls.add('roomReveal'),
        onSetCircleRevealMode: rec('circleMode'),
        onSetAoeMode: rec('aoeMode'),
        onSetAoe: (_) => calls.add('setAoe'),
        onClearAoe: rec('clearAoe'),
        onToggleRuler: rec('toggleRuler'),
        onRotateRuler: rec('rotateRuler'),
        onUpdateSessionSettings: (_) => calls.add('settings'),
        onTriggerEffect: (_) => calls.add('effect'),
        onSwitchMap: (id) => calls.add('switchMap:$id'),
        onAddMapFromDevice: rec('addFromDevice'),
        onOpenSharedLibrary: rec('sharedLibrary'),
        onShowCalibration: (on, pivot) => calls.add('showCalibration $on ${pivot.name}'),
      );
    }

    Future<VttState> pump(WidgetTester tester, Size size,
        {List<GameMap>? gameMaps}) async {
      calls = [];
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final state = VttState();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.bottomRight,
            // The host rebuilds the panel on state changes; so does this
            child: ListenableBuilder(
              listenable: state,
              builder: (_, _) =>
                  DmControlPanel(
                      state: state, callbacks: callbacks(), gameMaps: gameMaps),
            ),
          ),
        ),
      ));
      return state;
    }

    testWidgets('side rail on a landscape tablet unfolds beside the rail',
        (tester) async {
      await pump(tester, const Size(1280, 800));
      // Folded: only the rail, undo/redo at its foot
      expect(find.text('Fog'), findsOneWidget);
      expect(find.byIcon(Icons.undo), findsOneWidget);
      expect(find.text('Players see changes'), findsNothing);
      final folded = tester.getSize(find.byType(DmControlPanel));
      expect(folded.height, 800); // full height, not a bottom sheet

      await tester.tap(find.text('Fog'));
      await tester.pumpAndSettle();
      expect(find.text('Players see changes'), findsOneWidget);
      final open = tester.getSize(find.byType(DmControlPanel));
      expect(open.width, greaterThan(folded.width + 300));

      // Chevron folds it back into the rail
      await tester.tap(find.byIcon(Icons.chevron_right));
      await tester.pumpAndSettle();
      expect(find.text('Players see changes'), findsNothing);
    });

    testWidgets('portrait keeps the bottom sheet', (tester) async {
      await pump(tester, const Size(800, 1280));
      expect(find.byIcon(Icons.chevron_right), findsNothing);
      await tester.tap(find.text('Fog'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.expand_more), findsOneWidget);
      expect(tester.getSize(find.byType(DmControlPanel)).width, 800);
    });

    testWidgets('being on a tab is its mode, Tokens leftmost', (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      // Tokens is the first tab and the normal mode
      expect(tester.getTopLeft(find.text('Tokens')).dy,
          lessThan(tester.getTopLeft(find.text('Fog')).dy));
      expect(state.interactionMode, InteractionMode.token);

      await tester.tap(find.text('Draw').last);
      await tester.pumpAndSettle();
      expect(calls, ['drawMode']);
      expect(find.text('Draw Mode'), findsNothing); // no extra mode button
      state.setInteractionMode(InteractionMode.draw); // the TV's echo

      // Tapping the active tab only folds it; the mode stays
      await tester.tap(find.text('Draw').last);
      await tester.pumpAndSettle();
      expect(calls, ['drawMode']);

      await tester.tap(find.text('Tokens').last);
      await tester.pumpAndSettle();
      expect(calls, ['drawMode', 'tokenMode']);

      // Tabs without a mode of their own fall back to the Tokens mode
      state.setInteractionMode(InteractionMode.measure);
      calls.clear();
      await tester.tap(find.text('Camera').last);
      await tester.pumpAndSettle();
      expect(calls, ['tokenMode']);
    });

    testWidgets('Tokens tab: add off the map, place, jump, hide, delete',
        (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Tokens').last);
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Thorin');
      await tester.tap(find.byIcon(Icons.person_add));
      expect(calls, ['create Thorin']);

      // The TV's echo: one token off the map, one on it
      state.createToken(name: 'Thorin');
      state.addToken(2, 3);
      await tester.pumpAndSettle();
      final off = state.tokens[0].id, on = state.tokens[1].id;
      expect(find.text('Not on the map'), findsOneWidget);
      expect(find.text('On the map'), findsOneWidget);

      // Place arms the token for the next tap on the map
      await tester.tap(find.byIcon(Icons.place));
      await tester.pumpAndSettle();
      expect(state.placingTokenId, off);
      expect(find.text('Tap the map where Thorin stands.'), findsOneWidget);

      calls.clear();
      await tester.tap(find.byIcon(Icons.center_focus_strong));
      expect(calls, ['focus $on']);

      await tester.tap(find.byIcon(Icons.visibility).last);
      expect(calls.last, 'hidden $on true');

      await tester.tap(find.byIcon(Icons.delete_outline).first);
      expect(calls.last, 'remove $off');

      // Leaving the tab cancels placing
      await tester.tap(find.text('Fog').last);
      await tester.pumpAndSettle();
      expect(state.placingTokenId, isNull);
    });

    testWidgets('tapping a token opens a rename dialog that saves the name',
        (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Tokens').last);
      state.createToken(name: 'Goblin');
      await tester.pumpAndSettle();

      await tester.tap(find.text('Goblin'));
      await tester.pumpAndSettle();
      expect(find.text('Rename token'), findsOneWidget);
      expect(find.text('Max HP'), findsNothing); // digital play only
      expect(find.text('Conditions'), findsNothing);
      expect(tester.takeException(), isNull);

      await tester.enterText(find.byType(TextField).last, 'Goblin boss');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(calls, ['editToken']);
      expect(find.text('Rename token'), findsNothing);
    });

    testWidgets('a mode set elsewhere switches to its tab', (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Tokens').last); // unfold, no request
      await tester.pumpAndSettle();
      expect(find.text('No tokens yet'), findsOneWidget);

      state.setInteractionMode(InteractionMode.draw);
      await tester.pumpAndSettle();
      expect(find.text('Drag on the map to draw. The players see it on the TV.'),
          findsOneWidget);
      expect(calls, isEmpty);
    });

    testWidgets('Fog tab: Brush | Room and when players see changes',
        (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Fog'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Room'));
      expect(calls, contains('roomMode'));

      // Room tool: tap a room, no brush size
      state.setInteractionMode(InteractionMode.roomReveal);
      await tester.pumpAndSettle();
      expect(find.text('Tap a room to reveal all of it.'), findsOneWidget);
      expect(find.text('Brush size'), findsNothing);

      await tester.tap(find.text('Brush'));
      expect(calls, contains('fogMode'));

      // Already instant: tapping Instantly sends nothing, Preview first toggles
      await tester.tap(find.text('Instantly'));
      expect(calls, isNot(contains('toggleShadow')));
      await tester.tap(find.text('Preview first'));
      expect(calls, contains('toggleShadow'));
    });

    testWidgets('Fog tab: Circle tool with a radius in squares',
        (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Fog'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Circle'));
      expect(calls, contains('circleMode'));
      state.setInteractionMode(InteractionMode.circleReveal); // TV's echo
      await tester.pumpAndSettle();
      expect(find.text('4 squares'), findsOneWidget);
      expect(find.text('Brush size'), findsNothing);

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();
      expect(state.revealRadius, 5);
      expect(find.text('5 squares'), findsOneWidget);

      state.setRevealRadius(1);
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.remove));
      await tester.pumpAndSettle();
      expect(state.revealRadius, 1); // never below one square
      expect(find.text('1 square'), findsOneWidget);
    });

    testWidgets('Fog tab: trim revealed edges with the number stepper',
        (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Fog'));
      await tester.pumpAndSettle();
      expect(find.text('Trim revealed edges'), findsOneWidget);

      final stepper = find.byKey(const ValueKey('fogEdgeInsetStepper'));
      final plus1 = find.descendant(of: stepper, matching: find.text('+1'));
      await tester.ensureVisible(plus1);
      await tester.pumpAndSettle();
      await tester.tap(plus1);
      await tester.pumpAndSettle();
      await tester.tap(plus1);
      await tester.pumpAndSettle();
      expect(state.sessionSettings.fogEdgeInset, 2); // taps build on each other
      expect(calls.where((c) => c == 'settings'), hasLength(2));
    });

    testWidgets('Settings lists the game\'s maps and switches between them',
        (tester) async {
      await pump(tester, const Size(1280, 800), gameMaps: const [
        GameMap(id: 'town', name: 'Town', active: true),
        GameMap(id: 'cellar', name: 'Cellar'),
      ]);
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      expect(find.text('Maps in this game'), findsOneWidget);
      expect(find.text('Load Map'), findsNothing);
      expect(find.text('On the table'), findsOneWidget);

      await tester.tap(find.text('Town')); // already on the table
      await tester.tap(find.text('Cellar'));
      await tester.tap(find.text('From device'));
      await tester.tap(find.text('Shared library'));
      expect(calls, ['switchMap:cellar', 'addFromDevice', 'sharedLibrary']);
    });

    testWidgets('Measure the TV: the picture width is a stepper', (tester) async {
      final state = await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Measure the TV…'));
      await tester.tap(find.text('Measure the TV…'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final shown = tester
          .widget<Text>(find.descendant(
              of: find.byKey(const ValueKey('tvWidthStepper')),
              matching: find.byType(Text)).at(4)) // after −1 −.5 −.2 −.1
          .textSpan!
          .toPlainText();
      expect(shown, '${(state.tvWidthInches * 2.54).toStringAsFixed(1)} cm');
      await tester.ensureVisible(find.byTooltip('Picture width +1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Picture width +1'));
      await tester.pump();
      expect(calls, ['showCalibration true bottomLeft', 'calibrate']);

      // The ruler's zero: another spot moves the TV's bar there at once.
      await tester.ensureVisible(find.byKey(const ValueKey('pivot-center')));
      await tester.tap(find.byKey(const ValueKey('pivot-center')));
      await tester.pump();
      expect(calls.last, 'showCalibration true center');
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(calls.last, 'showCalibration false center');
    });

    testWidgets('without game maps (local mode) Settings keeps Load Map',
        (tester) async {
      await pump(tester, const Size(1280, 800));
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      expect(find.text('Maps in this game'), findsNothing);
      await tester.tap(find.text('Load Map'));
      expect(calls, ['loadMap']);
    });
  });
}
