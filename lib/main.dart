import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'ui/tv_shell.dart';
import 'ui/vtt_companion_screen.dart';
import 'ui/dev_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
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

/// Landing screen — pick TV Mode, Companion Mode, or Developer.
class ModeSelector extends StatelessWidget {
  const ModeSelector({super.key});

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
                  label: 'TV Mode',
                  subtitle: 'Display on TV (no touch)',
                  icon: Icons.tv,
                  autofocus: true,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const TvShell(),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                _ModeButton(
                  label: 'Companion Mode',
                  subtitle: 'DM control via relay',
                  icon: Icons.phone_android,
                  onTap: () => _showCompanionDialog(context),
                ),
                const SizedBox(height: 24),
                _ModeButton(
                  label: 'Developer',
                  subtitle: 'Logs & diagnostics',
                  icon: Icons.terminal,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const DevScreen(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showCompanionDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('Companion Mode'),
        content: Text(
          'Connect to the TV via the VPS relay,\nor use local mode for testing.',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.6),
            fontSize: 14,
          ),
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
                  builder: (_) => const VttCompanionScreen(localMode: true),
                ),
              );
            },
            child: const Text('Local Mode'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const VttCompanionScreen(),
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
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
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
