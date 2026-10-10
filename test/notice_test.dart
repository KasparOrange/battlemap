import 'package:battlemap/ui/notice.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// An app with the [NoticeHost] where main.dart puts it; [onReady] gets a
/// context inside the routes.
Widget _app(void Function(BuildContext) onReady) => MaterialApp(
      builder: (_, child) => NoticeHost(child: child!),
      home: Builder(builder: (context) {
        onReady(context);
        return const Scaffold(body: SizedBox.expand());
      }),
    );

void main() {
  late BuildContext ctx;

  testWidgets('closes by itself after its time', (tester) async {
    await tester.pumpWidget(_app((c) => ctx = c));
    Notice.show(ctx, 'Map deleted', duration: const Duration(seconds: 2));
    await tester.pump();
    expect(find.text('Map deleted'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1900));
    expect(find.text('Map deleted'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(find.text('Map deleted'), findsNothing);
  });

  testWidgets('a notice with a button closes by itself too', (tester) async {
    await tester.pumpWidget(_app((c) => ctx = c));
    var undone = 0;
    Notice.show(ctx, 'Whole map revealed', actionLabel: 'Undo', onAction: () => undone++);
    await tester.pump();
    expect(find.text('Undo'), findsOneWidget);
    await tester.pump(const Duration(seconds: 7));
    await tester.pumpAndSettle();
    expect(find.text('Whole map revealed'), findsNothing);
    expect(undone, 0);
  });

  testWidgets('the button runs its action and closes', (tester) async {
    await tester.pumpWidget(_app((c) => ctx = c));
    var undone = 0;
    Notice.show(ctx, 'Drawings cleared', actionLabel: 'Undo', onAction: () => undone++);
    await tester.pump();
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(undone, 1);
    expect(find.text('Drawings cleared'), findsNothing);
  });

  testWidgets('the × closes it at once', (tester) async {
    await tester.pumpWidget(_app((c) => ctx = c));
    Notice.show(ctx, 'Upload failed', kind: NoticeKind.error);
    await tester.pump();
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(find.text('Upload failed'), findsNothing);
  });

  testWidgets('a new notice replaces the old one; a stale id is ignored', (tester) async {
    await tester.pumpWidget(_app((c) => ctx = c));
    final first = Notice.show(ctx, 'First');
    await tester.pump();
    Notice.show(ctx, 'Second');
    // Not pumpAndSettle: it would run the countdown out as well.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('First'), findsNothing);
    expect(find.text('Second'), findsOneWidget);
    Notice.dismiss(ctx, first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Second'), findsOneWidget);
  });

  testWidgets('a finger on the card pauses the countdown', (tester) async {
    await tester.pumpWidget(_app((c) => ctx = c));
    Notice.show(ctx, 'Hold me', duration: const Duration(seconds: 1));
    await tester.pump();
    final gesture = await tester.startGesture(tester.getCenter(find.text('Hold me')));
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Hold me'), findsOneWidget);
    await gesture.up();
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('Hold me'), findsNothing);
  });

  test('time on screen grows with kind, button and length, capped at 10 s', () {
    Duration d(String m, NoticeKind k, bool a) =>
        Notice.autoDuration(m, kind: k, hasAction: a);
    expect(d('Saved', NoticeKind.info, false), const Duration(seconds: 3));
    expect(d('Saved', NoticeKind.error, false), const Duration(seconds: 5));
    expect(d('Saved', NoticeKind.info, true), const Duration(seconds: 6));
    expect(d('x' * 1000, NoticeKind.info, true), const Duration(seconds: 10));
  });
}
