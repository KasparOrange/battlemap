// Stub for web builds — update service not available.

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

Future<UpdateInfo?> checkForUpdate() async => null;

Future<void> downloadAndInstall({
  void Function(double progress)? onProgress,
  void Function(String status)? onStatus,
}) async {
  onStatus?.call('Updates not available on web');
}
