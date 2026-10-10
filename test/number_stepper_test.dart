import 'dart:typed_data';

import 'package:battlemap/ui/map_grid_dialog.dart';
import 'package:battlemap/ui/number_stepper.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

String shown(WidgetTester tester, String key) =>
    tester.widget<Text>(find.byKey(ValueKey(key))).textSpan!.toPlainText();

void main() {
  Future<List<double>> pumpStepper(WidgetTester tester,
      {double width = 600, double value = 12, int decimals = 0}) async {
    final changes = <double>[];
    var v = value;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: width,
            child: StatefulBuilder(
              builder: (context, setState) => NumberStepper(
                label: 'Squares',
                value: v,
                min: 1,
                max: 50,
                decimals: decimals,
                valueKey: const ValueKey('n'),
                onChanged: (n) => setState(() {
                  v = n;
                  changes.add(n);
                }),
              ),
            ),
          ),
        ),
      ),
    ));
    return changes;
  }

  testWidgets('steps both ways, biggest outside, clamped to the range', (tester) async {
    final changes = await pumpStepper(tester);
    for (final t in ['−10', '−5', '−2', '−1', '+1', '+2', '+5', '+10']) {
      expect(find.text(t), findsOneWidget);
    }
    expect(tester.getCenter(find.text('−10')).dx,
        lessThan(tester.getCenter(find.text('−1')).dx));
    await tester.tap(find.text('+5'));
    await tester.pump();
    expect(shown(tester, 'n'), '17');
    await tester.tap(find.text('−10'));
    await tester.pump();
    await tester.tap(find.text('−10'));
    await tester.pump();
    expect(changes, [17, 7, 1]);
  });

  testWidgets('a narrow row leaves the biggest steps off', (tester) async {
    await pumpStepper(tester, width: 260);
    expect(find.text('+1'), findsOneWidget);
    expect(find.text('+10'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tapping the number opens the numpad; out of range keeps OK off', (tester) async {
    final changes = await pumpStepper(tester);
    await tester.tap(find.byKey(const ValueKey('n')));
    await tester.pumpAndSettle();
    expect(find.text('.'), findsNothing); // whole numbers: no decimal key
    await tester.tap(find.byKey(const ValueKey('numpad3')));
    await tester.tap(find.byKey(const ValueKey('numpad3')));
    await tester.tap(find.byKey(const ValueKey('numpad0')));
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byKey(const ValueKey('numpadOk'))).onPressed, isNull);
    await tester.tap(find.byKey(const ValueKey('numpad⌫')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('numpadOk')));
    await tester.pumpAndSettle();
    expect(changes, [33]);
    expect(shown(tester, 'n'), '33');
  });

  testWidgets('the numpad types fractions up to the decimals', (tester) async {
    final changes = await pumpStepper(tester, value: 2, decimals: 1);
    await tester.tap(find.byKey(const ValueKey('n')));
    await tester.pumpAndSettle();
    for (final k in ['1', '.', '5', '5']) {
      await tester.tap(find.byKey(ValueKey('numpad$k')));
    }
    await tester.tap(find.byKey(const ValueKey('numpadOk')));
    await tester.pumpAndSettle();
    expect(changes, [1.5]);
  });

  testWidgets('map squares dialog: steppers, rows follow, gridless measures', (tester) async {
    MapGridChoice? choice;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: ElevatedButton(
            onPressed: () async => choice = await showMapGridDialog(context,
                title: 'Map squares',
                imageSize: const Size(1000, 700),
                initialCols: 20,
                pictureBytes: Uint8List(0),
                gridless: true),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Measure on the picture'), findsOneWidget);
    expect(find.textContaining('no grid lines found'), findsOneWidget);
    await tester.tap(find.byTooltip('Squares across +10'));
    await tester.pump();
    // 30 across over 1000 px = 33.3 px squares → 700 px = 21 down.
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect((choice!.cols, choice!.rows), (30, 21));
    expect(tester.takeException(), isNull);
  });
}
