import 'package:battlemap/model/shared_map.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SharedMap', () {
    test('parses the server entry and round-trips', () {
      final m = SharedMap.fromJson({
        'id': 'aaffcbed3573',
        'name': 'Tower floor 2',
        'kind': 'image',
        'gridCols': 20,
        'gridRows': 15,
        'hasOwnGrid': true,
        'file': 'aaffcbed3573.png',
        'url': '/uploads/library/aaffcbed3573.png',
        'size': 7,
        'addedAt': '2026-10-10T18:01:04+00:00',
        'thumbUrl': null,
      });
      expect(m.isImage, isTrue);
      expect(m.gridCols, 20);
      expect(m.hasOwnGrid, isTrue);
      expect(m.addedAt, DateTime.utc(2026, 10, 10, 18, 1, 4));
      final again = SharedMap.fromJson(m.toJson());
      expect(again.url, m.url);
      expect(again.gridRows, 15);
    });

    test('a vtt entry without extras gets defaults', () {
      final m = SharedMap.fromJson(
          {'id': 'x', 'name': 'Cave', 'url': '/uploads/library/x.dd2vtt'});
      expect(m.kind, 'vtt');
      expect(m.isImage, isFalse);
      expect(m.thumbUrl, isNull);
      expect(m.addedAt, isNull);
    });

    test('upload meta carries squares only for pictures', () {
      expect(SharedMap.uploadMeta(name: 'Cave', isImage: false),
          {'name': 'Cave', 'kind': 'vtt'});
      expect(
          SharedMap.uploadMeta(
              name: 'Inn', isImage: true, gridCols: 30, gridRows: 20, hasOwnGrid: true),
          {'name': 'Inn', 'kind': 'image', 'gridCols': 30, 'gridRows': 20, 'hasOwnGrid': true});
    });
  });
}
