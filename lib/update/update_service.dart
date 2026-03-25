import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../network/relay_config.dart';

/// Version info returned by checkForUpdate.
class UpdateInfo {
  final String currentVersion;
  final int currentVersionCode;
  final String availableVersion;
  final int availableVersionCode;
  final bool hasUpdate;

  UpdateInfo({
    required this.currentVersion,
    required this.currentVersionCode,
    required this.availableVersion,
    required this.availableVersionCode,
    required this.hasUpdate,
  });

  Map<String, dynamic> toJson() => {
        'currentVersion': currentVersion,
        'currentVersionCode': currentVersionCode,
        'availableVersion': availableVersion,
        'availableVersionCode': availableVersionCode,
        'hasUpdate': hasUpdate,
      };
}

/// Check the VPS for a newer APK version.
Future<UpdateInfo?> checkForUpdate() async {
  try {
    final info = await PackageInfo.fromPlatform();
    final currentCode = int.parse(info.buildNumber);
    final currentVersion = '${info.version}+${info.buildNumber}';

    // Fetch version.json from VPS
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 5);
    final request = await client
        .getUrl(Uri.parse('http://${RelayConfig.host}:4242/version.json'));
    final response = await request.close();

    if (response.statusCode != 200) {
      client.close();
      debugPrint('UpdateService: version.json returned ${response.statusCode}');
      return null;
    }

    final body = await response.transform(utf8.decoder).join();
    client.close();

    final json = jsonDecode(body) as Map<String, dynamic>;
    final availableVersion = json['version'] as String? ?? 'unknown';
    final availableCode = json['versionCode'] as int? ?? 0;

    return UpdateInfo(
      currentVersion: currentVersion,
      currentVersionCode: currentCode,
      availableVersion: availableVersion,
      availableVersionCode: availableCode,
      hasUpdate: availableCode > currentCode,
    );
  } catch (e) {
    debugPrint('UpdateService: check failed: $e');
    return null;
  }
}

/// Download APK from VPS and trigger install via platform channel.
Future<void> downloadAndInstall({
  void Function(double progress)? onProgress,
  void Function(String status)? onStatus,
}) async {
  try {
    onStatus?.call('Downloading APK...');
    final url = 'http://${RelayConfig.host}:4242/battlemap.apk';

    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 10);
    final request = await client.getUrl(Uri.parse(url));
    final response = await request.close();

    if (response.statusCode != 200) {
      client.close();
      onStatus?.call('Download failed: HTTP ${response.statusCode}');
      return;
    }

    final totalBytes = response.contentLength;
    final cacheDir = await getTemporaryDirectory();
    final apkFile = File('${cacheDir.path}/battlemap_update.apk');

    // Delete old file if exists
    if (await apkFile.exists()) {
      await apkFile.delete();
    }

    final sink = apkFile.openWrite();
    int received = 0;

    await for (final chunk in response) {
      sink.add(chunk);
      received += chunk.length;
      if (totalBytes > 0) {
        onProgress?.call(received / totalBytes);
      }
    }

    await sink.flush();
    await sink.close();
    client.close();

    // Verify APK is a valid ZIP file (APK magic bytes: PK\x03\x04)
    final fileBytes = await apkFile.readAsBytes();
    if (fileBytes.length < 4 ||
        fileBytes[0] != 0x50 || fileBytes[1] != 0x4B ||
        fileBytes[2] != 0x03 || fileBytes[3] != 0x04) {
      onStatus?.call('Download failed: file is not a valid APK');
      debugPrint('UpdateService: APK integrity check failed — invalid magic bytes');
      return;
    }

    // Sanity check: APK should be at least 1 MB
    if (fileBytes.length < 1024 * 1024) {
      onStatus?.call('Download failed: file too small (${(fileBytes.length / 1024).round()} KB)');
      debugPrint('UpdateService: APK too small: ${fileBytes.length} bytes');
      return;
    }

    onStatus?.call('Installing...');
    debugPrint('UpdateService: APK downloaded to ${apkFile.path} '
        '(${(received / 1024 / 1024).toStringAsFixed(1)} MB)');

    // Record current build number before install
    final preInstallInfo = await PackageInfo.fromPlatform();
    final preInstallBuild = preInstallInfo.buildNumber;

    // Call platform channel to trigger install intent
    const channel = MethodChannel('com.battlemap/update');
    await channel.invokeMethod('installApk', {'filePath': apkFile.path});

    onStatus?.call('Install dialog opened');

    // Poll for install verification (every 3s for 60s)
    _verifyInstall(preInstallBuild, onStatus);
  } catch (e) {
    debugPrint('UpdateService: download/install failed: $e');
    final errorMsg = e.toString();
    if (errorMsg.contains('SocketException') || errorMsg.contains('Connection')) {
      onStatus?.call('Download failed: network error');
    } else if (errorMsg.contains('FileSystemException')) {
      onStatus?.call('Download failed: storage error');
    } else {
      onStatus?.call('Error: $e');
    }
  }
}

/// Poll PackageInfo to verify the install succeeded.
Future<void> _verifyInstall(
  String preInstallBuild,
  void Function(String status)? onStatus,
) async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(const Duration(seconds: 3));
    try {
      final info = await PackageInfo.fromPlatform();
      if (info.buildNumber != preInstallBuild) {
        onStatus?.call('Install verified: build ${info.buildNumber}');
        debugPrint('UpdateService: install verified — '
            'build $preInstallBuild -> ${info.buildNumber}');
        return;
      }
    } catch (e) {
      debugPrint('UpdateService: verify poll error: $e');
    }
  }
  onStatus?.call('Install may not have completed — please check manually');
  debugPrint('UpdateService: install verification timed out after 60s');
}
