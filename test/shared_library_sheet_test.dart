import 'package:battlemap/model/shared_map.dart';
import 'package:battlemap/network/shared_library.dart';
import 'package:battlemap/ui/notice.dart';
import 'package:battlemap/ui/shared_library_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  late List<MapUploadSource> sources;
  SharedMap? uploadResult;

  Future<void> open(WidgetTester tester, {Set<String> inGame = const {}}) async {
    lib = _FakeLibrary([_inn, _cave]);
    opened = [];
    uploads = 0;
    sources = [];
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      builder: (_, child) => NoticeHost(child: child!),
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => showSharedLibrarySheet(
              context,
              client: lib,
              openLabel: 'Add to game',
              inGame: inGame,
              onOpen: (m) => opened.add(m.id),
              onUpload: (source, progress) async {
                uploads++;
                sources.add(source);
                return uploadResult; // null = cancelled
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
    expect(sources.single.link, isNull);
    expect(find.text('Upload from device'), findsOneWidget); // idle again
  });

  testWidgets('a typed link is fetched with the chosen format', (tester) async {
    await open(tester);
    expect(find.text('WebP · recommended'), findsOneWidget);
    expect(find.text(StoreFormat.original.hint), findsOneWidget); // default: as is
    await tester.tap(find.text('WebP · recommended'));
    await tester.pump();
    expect(find.text(StoreFormat.webp.hint), findsOneWidget);

    await tester.enterText(find.byType(TextField), '  https://x.org/inn.png ');
    await tester.tap(find.byTooltip('Fetch the link'));
    await tester.pumpAndSettle();
    expect(sources.single.link, 'https://x.org/inn.png');
    expect(sources.single.storeAs, StoreFormat.webp);
  });

  testWidgets('fetch with an empty field asks for a link', (tester) async {
    await open(tester);
    await tester.tap(find.byTooltip('Fetch the link'));
    await tester.pump();
    expect(uploads, 0);
  });

  testWidgets('the paste button pastes and fetches', (tester) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,
        (call) async => call.method == 'Clipboard.getData'
            ? {'text': 'https://x.org/keep.dd2vtt'}
            : null);
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));
    await open(tester);
    await tester.tap(find.byTooltip('Paste link and fetch'));
    await tester.pumpAndSettle();
    expect(sources.single.link, 'https://x.org/keep.dd2vtt');
    expect(find.text('https://x.org/keep.dd2vtt'), findsOneWidget);
  });

  testWidgets('a converted upload says what it became', (tester) async {
    uploadResult = const SharedMap(
        id: 'n', name: 'Goats', kind: 'image', url: '/uploads/library/n.webp',
        size: 116414, originalSize: 425906, convertNote: 'lossless');
    addTearDown(() => uploadResult = null);
    await open(tester);
    await tester.enterText(find.byType(TextField), 'https://x.org/goats.png');
    await tester.tap(find.byTooltip('Fetch the link'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.textContaining('as WebP, 0.4 → 0.1 MB (lossless)'), findsOneWidget);
    expect(find.text('https://x.org/goats.png'), findsNothing); // field cleared
  });
}
