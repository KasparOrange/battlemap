import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:battlemap/main.dart' as app;

/// Integration tests for the Battlemap app.
///
/// Run against web: flutter test integration_test --platform chrome
/// Run against device: flutter test integration_test -d <device_id>
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Mode Selector', () {
    testWidgets('shows three mode buttons', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(find.text('Battlemap'), findsOneWidget);
      expect(find.text('TV Mode'), findsOneWidget);
      expect(find.text('Companion Mode'), findsOneWidget);
      expect(find.text('Developer'), findsOneWidget);
    });

    testWidgets('TV Mode navigates to TvShell', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.tap(find.text('TV Mode'));
      await tester.pumpAndSettle();

      // TvShell should show waiting view with relay status
      expect(find.byIcon(Icons.arrow_back), findsOneWidget);
    });

    testWidgets('Developer screen opens', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Developer'));
      await tester.pumpAndSettle();

      expect(find.text('Developer'), findsWidgets);
    });

    testWidgets('Companion Mode shows dialog', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Companion Mode'));
      await tester.pumpAndSettle();

      expect(find.text('Connect'), findsOneWidget);
      expect(find.text('Local Mode'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
    });

    testWidgets('Local Mode companion opens', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Companion Mode'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Local Mode'));
      await tester.pumpAndSettle();

      // Should show the game UI with DM panel icon
      expect(find.byIcon(Icons.shield), findsOneWidget);
    });
  });

  group('DM Control Panel (Local Mode)', () {
    Future<void> openLocalCompanion(WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Companion Mode'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Local Mode'));
      await tester.pumpAndSettle();
    }

    testWidgets('panel opens on shield tap', (tester) async {
      await openLocalCompanion(tester);

      // Tap the shield icon to expand DM panel
      await tester.tap(find.byIcon(Icons.shield));
      await tester.pumpAndSettle();

      // Should see tab icons
      expect(find.text('DM'), findsOneWidget);
    });
  });
}
