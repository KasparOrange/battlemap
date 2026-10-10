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
    expect(find.text('W 32.00'), findsOneWidget);
    expect(find.text('H 32.00'), findsOneWidget);
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
