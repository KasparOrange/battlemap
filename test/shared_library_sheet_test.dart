import 'package:battlemap/model/shared_map.dart';
import 'package:battlemap/network/shared_library.dart';
import 'package:battlemap/ui/shared_library_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A library in memory instead of the VPS.
class _FakeLibrary extends SharedLibraryClient {
  _FakeLibrary(this.maps) : super(base: 'http://test');
  final List<SharedMap> maps;
  final List<String> deleted = [];

  @override
  Future<List<SharedMap>?> list() async => List.of(maps);

  @override
  Future<bool> delete(String id) async {
    deleted.add(id);
    maps.removeWhere((m) => m.id == id);
    return true;
  }
}

const _cave = SharedMap(id: 'c', name: 'Cave', kind: 'vtt', url: '/uploads/library/c.dd2vtt');
const _inn = SharedMap(
    id: 'i', name: 'Inn', kind: 'image', url: '/uploads/library/i.png', gridCols: 30, gridRows: 20);

void main() {
  late _FakeLibrary lib;
  late List<String> opened;
  late int uploads;

  Future<void> open(WidgetTester tester, {Set<String> inGame = const {}}) async {
    lib = _FakeLibrary([_inn, _cave]);
    opened = [];
    uploads = 0;
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => showSharedLibrarySheet(
              context,
              client: lib,
              openLabel: 'Add to game',
              inGame: inGame,
              onOpen: (m) => opened.add(m.id),
              onUpload: (progress) async {
                uploads++;
                return null; // cancelled
              },
            ),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('lists the maps and opens one', (tester) async {
    await open(tester);
    expect(find.text('Shared map library'), findsOneWidget);
    expect(find.text('Inn'), findsOneWidget);
    expect(find.textContaining('30 × 20 squares'), findsOneWidget);
    expect(find.textContaining('Dungeondraft map'), findsOneWidget);

    await tester.tap(find.text('Add to game').last); // Cave
    await tester.pumpAndSettle();
    expect(opened, ['c']);
    expect(find.text('Shared map library'), findsNothing); // closed
  });

  testWidgets('maps already in the game are marked, not offered', (tester) async {
    await open(tester, inGame: {'i'});
    expect(find.text('In this game'), findsOneWidget);
    expect(find.text('Add to game'), findsOneWidget);
  });

  testWidgets('delete asks first, then removes the row', (tester) async {
    await open(tester);
    await tester.tap(find.byIcon(Icons.delete_outline).first); // Inn
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(lib.deleted, isEmpty);

    await tester.tap(find.byIcon(Icons.delete_outline).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(lib.deleted, ['i']);
    expect(find.text('Inn'), findsNothing);
    expect(find.text('Cave'), findsOneWidget);
  });

  testWidgets('upload from device runs the uploader', (tester) async {
    await open(tester);
    await tester.tap(find.text('Upload from device'));
    await tester.pumpAndSettle();
    expect(uploads, 1);
    expect(find.text('Upload from device'), findsOneWidget); // idle again
  });
}
