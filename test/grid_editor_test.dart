import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:battlemap/model/raster_grid.dart';
import 'package:battlemap/ui/grid_editor.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A 640 × 480 PNG with dark lines every 32 px.
Future<Uint8List> gridPng() async {
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  c.drawRect(const Rect.fromLTWH(0, 0, 640, 480), Paint()..color = const Color(0xFF888888));
  final line = Paint()..color = const Color(0xFF222222);
  for (var x = 0.0; x <= 640; x += 32) {
    c.drawRect(Rect.fromLTWH(x - 1, 0, 2, 480), line);
  }
  for (var y = 0.0; y <= 480; y += 32) {
    c.drawRect(Rect.fromLTWH(0, y - 1, 640, 2), line);
  }
  final img = await rec.endRecording().toImage(640, 480);
  final png = await img.toByteData(format: ui.ImageByteFormat.png);
  img.dispose();
  return png!.buffer.asUint8List();
}

const picture = Size(640, 480);

/// The screen point of picture point [pic] (the canvas sits below the app bar).
Offset canvasAt(WidgetTester tester, GridEditorPageState s, Offset pic) =>
    tester.getTopLeft(find.byKey(const ValueKey('gridEditorCanvas'))) + s.screenOf(pic);

/// The number a [NumberStepper] shows, found by its value key.
String stepperText(WidgetTester tester, String key) =>
    tester.widget<Text>(find.byKey(ValueKey(key))).textSpan!.toPlainText();

void main() {
  late Uint8List png;
  RasterGrid? result;

  Future<GridEditorPageState> open(WidgetTester tester, RasterGrid initial,
      {Size screen = const Size(1280, 800)}) async {
    tester.view.physicalSize = screen;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.runAsync(() async => png = await gridPng());
    result = null;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async =>
                  result = await showGridEditor(context, pictureBytes: png, initial: initial),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    // Let the picture decode, then the first frame fits it.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pump();
    await tester.pump();
    return tester.state<GridEditorPageState>(find.byType(GridEditorPage));
  }

  testWidgets('shows the counts and steps the size by 0.01, corner kept', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    expect(find.text('20 × 15 squares'), findsOneWidget);
    await tester.tap(find.text('+.01'));
    await tester.pump();
    expect(s.grid.cellW, closeTo(32.01, 1e-9));
    expect(s.grid.cellH, closeTo(32.01, 1e-9));
    expect(s.grid.x, 0);
    await tester.tap(find.byTooltip('Undo'));
    await tester.pump();
    expect(s.grid.cellW, 32);
  });

  testWidgets('free squares get a width and a height row', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('Square squares'));
    await tester.pump();
    expect(s.square, isFalse);
    expect(stepperText(tester, 'gridEditorCellW'), '32.00 px');
    expect(stepperText(tester, 'gridEditorCellH'), '32.00 px');
    await tester.tap(find.text('+.1').last); // the height row
    await tester.pump();
    expect(s.grid.cellW, 32);
    expect(s.grid.cellH, closeTo(32.1, 1e-9));
  });

  testWidgets('two corners and their count set the squares', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('2 corners'));
    await tester.pump();
    expect(s.tool, GridTool.corners);
    // Pretend the drawn squares were 33 px: corners 10 × 8 squares apart.
    await tester.tapAt(s.screenOf(const Offset(32, 32)));
    await tester.pump();
    await tester.tapAt(s.screenOf(const Offset(32 + 330, 32 + 264)));
    await tester.pump();
    expect(find.text('10'), findsWidgets);
    await tester.tap(find.byKey(const ValueKey('gridEditorUseCorners')));
    await tester.pump();
    expect(s.grid.cellW, closeTo(33, 0.06));
    // Taps land on whole screen pixels (~0.4 picture px here).
    expect(s.grid.x % 33, closeTo(32, 0.6));
  });

  testWidgets('dragging in Move slides the grid as one undo step', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('Move grid'));
    await tester.pump();
    final from = s.screenOf(const Offset(320, 240));
    final to = s.screenOf(const Offset(330, 245));
    await tester.dragFrom(from, to - from);
    await tester.pump();
    // Re-counted: the grid starts 10 px in, so the first line sits at 10.
    expect(s.grid.x % 32, closeTo(10, 0.6));
    expect(s.grid.y % 32, closeTo(5, 0.6));
    await tester.tap(find.byTooltip('Undo'));
    await tester.pump();
    expect(s.grid.x, 0);
  });

  testWidgets('a pinch in Move grid moves the view, never the grid', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('Move grid'));
    await tester.pump();
    final c = s.screenOf(const Offset(320, 240));
    final f1 = await tester.startGesture(c, pointer: 1);
    await f1.moveBy(const Offset(30, 0)); // the first finger slips
    await tester.pump();
    final f2 = await tester.startGesture(c + const Offset(0, 120), pointer: 2);
    await tester.pump();
    await f1.moveBy(const Offset(-40, -40));
    await f2.moveBy(const Offset(40, 40));
    await tester.pump();
    await f1.up();
    await f2.up();
    await tester.pump();
    expect(s.grid.x, 0);
    expect(s.grid.cols, 20);
    expect(find.byTooltip('Undo'), findsOneWidget);
    expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.undo)).onPressed,
        isNull, reason: 'a pinch leaves no undo step');
  });

  testWidgets('a pinch in 2 corners places no marks', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('2 corners'));
    await tester.pump();
    for (var i = 0; i < 3; i++) {
      final c = s.screenOf(Offset(100.0 + 50 * i, 200));
      final f1 = await tester.startGesture(c, pointer: 10 + 2 * i);
      await f1.moveBy(const Offset(20, 0));
      await tester.pump();
      final f2 = await tester.startGesture(c + const Offset(0, 100), pointer: 11 + 2 * i);
      await f2.moveBy(const Offset(0, 40));
      await tester.pump();
      await f1.up();
      await f2.up();
      await tester.pump();
    }
    expect(find.text('Mark 1: tap a grid corner.'), findsOneWidget);
  });

  testWidgets('in 2 corners, down follows across', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('2 corners'));
    await tester.pump();
    await tester.tapAt(s.screenOf(const Offset(32, 32)));
    await tester.pump();
    await tester.tapAt(s.screenOf(const Offset(32 + 320, 32 + 256)));
    await tester.pump();
    String across() => stepperText(tester, 'gridEditorAcross');
    String down() => stepperText(tester, 'gridEditorDown');
    expect((across(), down()), ('10', '8'));
    const plus2 = 'Squares across between the marks +2';
    await tester.ensureVisible(find.byTooltip(plus2));
    await tester.tap(find.byTooltip(plus2));
    await tester.pump();
    // 12 across over 320 px = 26.7 px → 256 px down = 9.6 → 10.
    expect((across(), down()), ('12', '10'));
  });

  testWidgets('Known length: a line and its squares set the scale', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('Known length (no grid in the picture)'));
    await tester.pump();
    expect(s.tool, GridTool.length);
    // A 4-square door frame of 50 px squares: 200 px from (100, 60).
    await tester.tapAt(canvasAt(tester, s, const Offset(100, 60)));
    await tester.pump();
    await tester.tapAt(canvasAt(tester, s, const Offset(300, 60)));
    await tester.pump();
    // Starts from the current 32 px squares: 200 / 32 ≈ 6.
    expect(stepperText(tester, 'gridEditorLength'), '6.0 sq');
    const minus2 = 'Length in squares −2';
    await tester.ensureVisible(find.byTooltip(minus2));
    await tester.tap(find.byTooltip(minus2));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const ValueKey('gridEditorUseLength')));
    await tester.tap(find.byKey(const ValueKey('gridEditorUseLength')));
    await tester.pump();
    // Taps land on whole screen pixels (~0.4 picture px here).
    expect(s.grid.cellW, closeTo(50, 0.3));
    expect(s.grid.cellH, s.grid.cellW);
    // Lines through the line's start (100, 60): off a multiple by < 0.6 px.
    double off(double v, double at) {
      final r = (v - at) % s.grid.cellW;
      return min(r, s.grid.cellW - r);
    }

    expect(off(s.grid.x, 100), lessThan(0.6));
    expect(off(s.grid.y, 60), lessThan(0.6));
  });

  testWidgets('Known length in feet: 5 ft per square', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('Known length (no grid in the picture)'));
    await tester.pump();
    await tester.tapAt(canvasAt(tester, s, const Offset(100, 60)));
    await tester.pump();
    await tester.tapAt(canvasAt(tester, s, const Offset(100, 460)));
    await tester.pump();
    await tester.ensureVisible(find.text('Feet (5 per square)'));
    await tester.tap(find.text('Feet (5 per square)'));
    await tester.pump();
    expect(stepperText(tester, 'gridEditorLength'), '65.0 ft'); // 400 / 32 = 12.5 → 13 squares
    await tester.tap(find.byTooltip('Length in feet +10'));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const ValueKey('gridEditorUseLength')));
    await tester.tap(find.byKey(const ValueKey('gridEditorUseLength')));
    await tester.pump();
    expect(s.grid.cellW, closeTo(400 / 15, 0.3)); // 75 ft
  });

  testWidgets('the arrows nudge by the chosen step', (tester) async {
    final s = await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.ensureVisible(find.text('0.1 px'));
    await tester.pump();
    await tester.tap(find.text('0.1 px'));
    await tester.pump();
    await tester.tap(find.byTooltip('Grid right'));
    await tester.pump();
    expect(s.grid.x, closeTo(0.1, 1e-9));
  });

  testWidgets('Apply returns the edited grid, ½ halves the squares', (tester) async {
    await open(tester, RasterGrid.whole(20, 15, picture));
    await tester.tap(find.text('½ size'));
    await tester.pump();
    expect(find.text('40 × 30 squares'), findsOneWidget);
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(result!.cellW, 16);
    expect((result!.cols, result!.rows), (40, 30));
  });

  for (final screen in [const Size(800, 1280), const Size(412, 915)]) {
    testWidgets('lays out without overflow on ${screen.width.round()} × ${screen.height.round()}',
        (tester) async {
      final s = await open(tester, RasterGrid.whole(20, 15, picture), screen: screen);
      await tester.tap(find.text('2 corners'));
      await tester.pump();
      // Scroll the whole panel through once.
      await tester.drag(find.byType(ListView), const Offset(0, -3000));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(s.grid.cols, 20);
    });
  }
}
