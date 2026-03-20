import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'game_state.dart';
import 'table_screen.dart';
import 'companion_screen.dart';
import 'ui/vtt_screen.dart';
import 'ui/vtt_companion_screen.dart';

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
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
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
              subtitle: 'Display on TV (no touch)',
              icon: Icons.tv,
              autofocus: true,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const VttScreen(),
                ),
              ),
            ),
            const SizedBox(height: 24),
            _ModeButton(
              label: 'VTT Companion',
              subtitle: kIsWeb
                  ? 'DM control (local only)'
                  : 'DM control via Wi-Fi',
              icon: Icons.map,
              onTap: () {
                if (kIsWeb) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const VttCompanionScreen(),
                    ),
                  );
                } else {
                  _showVttConnectDialog(context);
                }
              },
            ),
          ],
        ),
      ),
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
  void _showVttConnectDialog(BuildContext context) {
    final ipController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('Connect to VTT Table'),
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
              style: const TextStyle(fontFamily: 'monospace', fontSize: 18),
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
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const VttCompanionScreen(),
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
                  builder: (_) => VttCompanionScreen(serverHost: ip),
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

class _ModeButton extends StatefulWidget {
  final String label;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;
  final bool autofocus;

  const _ModeButton({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.onTap,
    this.autofocus = false,
  });

  @override
  State<_ModeButton> createState() => _ModeButtonState();
}

class _ModeButtonState extends State<_ModeButton> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    return Focus(
      autofocus: widget.autofocus,
      onFocusChange: (focused) => setState(() => _focused = focused),
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent &&
            (event.logicalKey == LogicalKeyboardKey.select ||
             event.logicalKey == LogicalKeyboardKey.enter ||
             event.logicalKey == LogicalKeyboardKey.gameButtonA)) {
          widget.onTap();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: 280,
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 24),
          decoration: BoxDecoration(
            color: _focused
                ? Colors.white.withValues(alpha: 0.2)
                : Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: _focused
                  ? Colors.white.withValues(alpha: 0.6)
                  : Colors.white.withValues(alpha: 0.15),
              width: _focused ? 2.0 : 1.0,
            ),
          ),
          child: Row(
            children: [
              Icon(widget.icon, size: 32,
                  color: _focused ? Colors.white : Colors.white70),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.label,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: _focused ? Colors.white : Colors.white,
                      ),
                    ),
                    Text(
                      widget.subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        color: _focused
                            ? Colors.white.withValues(alpha: 0.7)
                            : Colors.white.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
              if (_focused)
                const Icon(Icons.chevron_right, color: Colors.white54, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
