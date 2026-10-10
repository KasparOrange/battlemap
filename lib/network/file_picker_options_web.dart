import 'package:file_picker/file_picker.dart';
import 'package:file_picker_web/file_picker_web.dart';

/// Web file-picker options that survive the page losing focus.
///
/// `file_picker_web` ≥ 3 cancels a pending pick on the window's `focus` event
/// (`cancelUploadOnWindowBlur`, default `true`). iOS Safari blurs the page
/// while the Files / Photos sheet is open and fires `focus` when it closes,
/// often *before* the input's `change` event — so on the iPhone every pick
/// came back `null` and "nothing happened" (2026-09-06). The web plugin only
/// honours the setting inside its own [FilePickerWebOptions]; the deprecated
/// top-level `cancelUploadOnWindowBlur` argument is ignored.
WebOptions webFilePickerOptions() =>
    const FilePickerWebOptions(cancelUploadOnWindowBlur: false);
