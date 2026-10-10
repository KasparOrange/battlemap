import 'package:file_picker/file_picker.dart';

/// Non-web stand-in for [webFilePickerOptions]: the default options.
///
/// See `file_picker_options_web.dart` for the web implementation and
/// `VttCompanionScreen._pickAndUploadMap` for why it exists.
WebOptions webFilePickerOptions() => const WebOptions();
