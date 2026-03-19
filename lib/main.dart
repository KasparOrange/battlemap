import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'game_state.dart';
import 'table_screen.dart';
import 'companion_screen.dart';
import 'ui/vtt_screen.dart';

void main() {
  runApp(const BattlemapApp());
}

class BattlemapApp extends StatefulWidget {
  const BattlemapApp({super.key});

  @override
  State<BattlemapApp> createState() => _BattlemapAppState();
}

class _BattlemapAppState extends State<BattlemapApp> {
  final GameState _gameState = GameState();

  @override
  void dispose() {
    _gameState.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Battlemap',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF1A1A2E),
      ),
      home: ModeSelector(gameState: _gameState),
    );
  }
}

/// Landing screen — pick Table Mode or Companion Mode.
class ModeSelector extends StatelessWidget {
  final GameState gameState;
  const ModeSelector({super.key, required this.gameState});

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
              subtitle: kIsWeb ? 'Display (local only)' : 'Display on TV',
              icon: Icons.tv,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => TableScreen(gameState: gameState),
                ),
              ),
            ),
            const SizedBox(height: 24),
            _ModeButton(
              label: 'Companion Mode',
              subtitle:
                  kIsWeb ? 'Control (local only)' : 'Connect to TV via Wi-Fi',
              icon: Icons.phone_android,
              onTap: () {
                if (kIsWeb) {
                  // Web: go directly to companion in local mode
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          CompanionScreen(gameState: gameState),
                    ),
                  );
                } else {
                  // Native: show connect dialog first
                  _showConnectDialog(context);
                }
              },
            ),
            const SizedBox(height: 24),
            _ModeButton(
              label: 'VTT Table Mode',
              subtitle: 'Physical table with miniatures',
              icon: Icons.map,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const VttScreen(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showConnectDialog(BuildContext context) {
    final ipController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('Connect to Table'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Enter the IP address shown on the TV',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.6),
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: ipController,
              keyboardType: TextInputType.number,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 18,
              ),
              decoration: InputDecoration(
                hintText: '192.168.1.xxx',
                hintStyle: TextStyle(
                  color: Colors.white.withValues(alpha: 0.3),
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              // Local mode (no server)
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      CompanionScreen(gameState: gameState),
                ),
              );
            },
            child: const Text('Local Mode'),
          ),
          FilledButton(
            onPressed: () {
              final ip = ipController.text.trim();
              if (ip.isEmpty) return;
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CompanionScreen(
                    gameState: gameState,
                    serverHost: ip,
                  ),
                ),
              );
            },
            child: const Text('Connect'),
          ),
        ],
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
