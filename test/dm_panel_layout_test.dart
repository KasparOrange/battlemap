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
        onUndo: rec('undo'),
        onRedo: rec('redo'),
        onToggleShadowMode: rec('toggleShadow'),
        onCommitShadow: rec('commitShadow'),
        onClearShadow: rec('clearShadow'),
        onSetRoomRevealMode: rec('roomMode'),
        onRoomReveal: (_) => calls.add('roomReveal'),
        onSetAoeMode: rec('aoeMode'),
        onSetAoe: (_) => calls.add('setAoe'),
        onClearAoe: rec('clearAoe'),
        onToggleRuler: rec('toggleRuler'),
        onRotateRuler: rec('rotateRuler'),
        onUpdateSessionSettings: (_) => calls.add('settings'),
        onTriggerEffect: (_) => calls.add('effect'),
      );
    }

    Future<VttState> pump(WidgetTester tester, Size size) async {
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
                  DmControlPanel(state: state, callbacks: callbacks()),
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
  });
}
