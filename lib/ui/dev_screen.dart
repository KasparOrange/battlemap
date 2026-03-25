import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../network/relay_config.dart';
import 'dev_log.dart';

/// Developer diagnostics screen.
///
/// Displays relay configuration info ([RelayConfig] host/port, platform)
/// and a real-time scrolling log fed by [DevLog]. Log lines are
/// colour-coded: red for errors, orange for warnings, cyan for TV
/// messages, and white for everything else.
///
/// Provides controls to toggle auto-scroll and clear the log buffer.
///
/// See also:
/// - [DevLog], the singleton log buffer that supplies log lines.
class DevScreen extends StatefulWidget {
  /// Creates the developer screen.
  const DevScreen({super.key});

  @override
  State<DevScreen> createState() => _DevScreenState();
}

class _DevScreenState extends State<DevScreen> {
  final ScrollController _scrollController = ScrollController();
  bool _autoScroll = true;

  @override
  void initState() {
    super.initState();
    DevLog.addListener(_onLogUpdate);
  }

  @override
  void dispose() {
    DevLog.removeListener(_onLogUpdate);
    _scrollController.dispose();
    super.dispose();
  }

  void _onLogUpdate() {
    setState(() {});
    if (_autoScroll) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white54),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    'Developer',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  // Auto-scroll toggle
                  IconButton(
                    icon: Icon(
                      _autoScroll
                          ? Icons.vertical_align_bottom
                          : Icons.vertical_align_center,
                      color: _autoScroll ? Colors.greenAccent : Colors.white38,
                      size: 20,
                    ),
                    tooltip: _autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF',
                    onPressed: () => setState(() => _autoScroll = !_autoScroll),
                  ),
                  // Clear log
                  IconButton(
                    icon: const Icon(Icons.delete_outline,
                        color: Colors.white38, size: 20),
                    tooltip: 'Clear log',
                    onPressed: () {
                      DevLog.lines.clear();
                      setState(() {});
                    },
                  ),
                ],
              ),
            ),

            // Info section
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _infoRow('Relay', '${RelayConfig.host}:${RelayConfig.port}'),
                    const SizedBox(height: 4),
                    _infoRow('Platform', kIsWeb ? 'Web' : 'Native (APK)'),
                    const SizedBox(height: 4),
                    _infoRow('Log lines', '${DevLog.lines.length}'),
                  ],
                ),
              ),
            ),

            // Divider
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Divider(
                  color: Colors.white.withValues(alpha: 0.1), height: 1),
            ),

            // Log list
            Expanded(
              child: DevLog.lines.isEmpty
                  ? const Center(
                      child: Text(
                        'No log messages yet',
                        style: TextStyle(color: Colors.white24, fontSize: 14),
                      ),
                    )
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
                      itemCount: DevLog.lines.length,
                      itemBuilder: (context, index) {
                        final line = DevLog.lines[index];
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 1),
                          child: Text(
                            line,
                            style: TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: _colorForLine(line),
                              height: 1.4,
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      children: [
        Text(
          '$label: ',
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: 12,
            color: Colors.white.withValues(alpha: 0.4),
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 12,
            color: Colors.white70,
          ),
        ),
      ],
    );
  }

  Color _colorForLine(String line) {
    if (line.contains('error') || line.contains('Error') || line.contains('ERROR')) {
      return Colors.redAccent;
    }
    if (line.contains('warn') || line.contains('Warn') || line.contains('WARN')) {
      return Colors.orangeAccent;
    }
    if (line.contains('[TV]')) {
      return Colors.cyanAccent.withValues(alpha: 0.8);
    }
    return Colors.white.withValues(alpha: 0.7);
  }
}
