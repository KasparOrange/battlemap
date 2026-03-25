/// Stub for web builds — remote logging disabled.
/// Web builds use the JavaScript console override in index.html instead.
class RemoteLog {
  static void setSource(String source) {}
  static void send(String msg) {}
  static void sendEvent(String event, Map<String, dynamic> data) {}
  static Future<void> sendDeviceInfo() async {}
}
