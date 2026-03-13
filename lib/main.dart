import 'package:flutter/material.dart';

void main() {
  runApp(const BattlemapApp());
}

class BattlemapApp extends StatelessWidget {
  const BattlemapApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Battlemap',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF1A1A2E),
      ),
      home: const ModeSelector(),
    );
  }
}

/// Landing screen — pick Table Mode or Companion Mode.
class ModeSelector extends StatelessWidget {
  const ModeSelector({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Battlemap',
              style: TextStyle(
                fontSize: 48,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'D&D Digital Battlemap',
              style: TextStyle(
                fontSize: 16,
                color: Colors.white.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 64),
            _ModeButton(
              label: 'Table Mode',
              subtitle: 'Display on TV',
              icon: Icons.tv,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const TableScreen()),
              ),
            ),
            const SizedBox(height: 24),
            _ModeButton(
              label: 'Companion Mode',
              subtitle: 'Control from phone',
              icon: Icons.phone_android,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CompanionScreen()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  final String label;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  const _ModeButton({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 260,
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 24),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.15),
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 32, color: Colors.white70),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.white.withValues(alpha: 0.5),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Table Mode — the fullscreen battlemap displayed on the TV.
class TableScreen extends StatelessWidget {
  const TableScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.grid_on, size: 64, color: Colors.white24),
            const SizedBox(height: 16),
            const Text(
              'Table Mode',
              style: TextStyle(fontSize: 24, color: Colors.white),
            ),
            const SizedBox(height: 8),
            Text(
              'Battlemap canvas coming soon',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Companion Mode — phone controller for the battlemap.
class CompanionScreen extends StatelessWidget {
  const CompanionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Companion'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.touch_app, size: 64, color: Colors.white24),
            const SizedBox(height: 16),
            const Text(
              'Companion Mode',
              style: TextStyle(fontSize: 24, color: Colors.white),
            ),
            const SizedBox(height: 8),
            Text(
              'Controls coming soon',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
