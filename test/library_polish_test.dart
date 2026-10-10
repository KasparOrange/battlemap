import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:battlemap/storage/map_thumbnails.dart';
import 'package:battlemap/ui/library_cards.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A [width] × [height] PNG, painted grey.
Future<Uint8List> _png(int width, int height) async {
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawRect(
      Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
      Paint()..color = const Color(0xFF808080));
  final image = await recorder.endRecording().toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}

Future<Size> _size(Uint8List png) async {
  final codec = await ui.instantiateImageCodec(png);
  final image = (await codec.getNextFrame()).image;
  final size = Size(image.width.toDouble(), image.height.toDouble());
  image.dispose();
  return size;
}

void main() {
  group('defaultSessionName', () {
    test('numbers the session and dates it', () {
      // 2026-10-10 is a Saturday
      expect(defaultSessionName(2, DateTime(2026, 10, 10)),
          'Session 3 · Sat 10 Oct');
    });

    test('first session of a map is Session 1', () {
      expect(defaultSessionName(0, DateTime(2026, 1, 5)),
          'Session 1 · Mon 5 Jan');
    });
  });

  group('MapThumbnails', () {
    test('uvttPicture extracts the embedded image', () {
      final file = utf8.encode(jsonEncode({
        'format': 0.3,
        'image': base64Encode([7, 8, 9]),
      }));
      expect(MapThumbnails.uvttPicture(Uint8List.fromList(file)), [7, 8, 9]);
    });

    test('uvttPicture returns null for non-UVTT bytes', () {
      expect(MapThumbnails.uvttPicture(Uint8List.fromList([0xFF, 0xD8])), isNull);
      final noImage = utf8.encode(jsonEncode({'format': 0.3}));
      expect(MapThumbnails.uvttPicture(Uint8List.fromList(noImage)), isNull);
    });

    testWidgets('encode shrinks the longest side to maxSide, keeps the aspect',
        (tester) async {
      await tester.runAsync(() async {
        final thumb = await MapThumbnails.encode(await _png(1000, 500));
        expect(thumb, isNotNull);
        expect(await _size(thumb!),
            const Size(MapThumbnails.maxSide * 1.0, MapThumbnails.maxSide / 2));
      });
    });

    testWidgets('encode never upscales a small picture', (tester) async {
      await tester.runAsync(() async {
        final thumb = await MapThumbnails.encode(await _png(100, 60));
        expect(await _size(thumb!), const Size(100, 60));
      });
    });

    testWidgets('encode returns null for garbage', (tester) async {
      await tester.runAsync(() async {
        expect(await MapThumbnails.encode(Uint8List.fromList([1, 2, 3])), isNull);
      });
    });
  });

  group('ContinueSessionCard', () {
    testWidgets('shows the session and resumes on tap', (tester) async {
      var tapped = false;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ContinueSessionCard(
            sessionName: 'Session 2 · Fri 9 Oct',
            mapName: 'Tavern',
            ago: '1d ago',
            thumbnail: null,
            onTap: () => tapped = true,
          ),
        ),
      ));
      expect(find.text('CONTINUE'), findsOneWidget);
      expect(find.text('Session 2 · Fri 9 Oct'), findsOneWidget);
      expect(find.text('Tavern  •  1d ago'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
      await tester.tap(find.byType(ContinueSessionCard));
      expect(tapped, isTrue);
    });

    testWidgets('shows progress while loading', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ContinueSessionCard(
            sessionName: 'S',
            mapName: 'M',
            ago: 'now',
            thumbnail: null,
            progress: 0.4,
            onTap: () {},
          ),
        ),
      ));
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    });
  });
}
