import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart' show ShadButton, ShadInput;

import 'package:ada/data/services/local/local_profile_service.dart';
import 'package:ada/ui/core/themes/app_theme.dart';
import 'package:ada/ui/settings/widgets/settings_components.dart';

class LocalProfileSettingsCard extends ConsumerStatefulWidget {
  const LocalProfileSettingsCard({super.key});

  @override
  ConsumerState<LocalProfileSettingsCard> createState() =>
      _LocalProfileSettingsCardState();
}

class _LocalProfileSettingsCardState
    extends ConsumerState<LocalProfileSettingsCard> {
  late final TextEditingController _nameController;
  final List<String> _quickEmojis = const [
    '\u{1F345}', // tomato
    '\u{2615}', // coffee
    '\u{26A1}', // zap
    '\u{1F680}', // rocket
    '\u{1F331}', // seedling
    '\u{1F4BB}', // laptop
    '\u{1F3A7}', // headphones
    '\u{2B50}', // star
    '\u{1F98A}', // fox
    '\u{1F408}', // cat
  ];

  @override
  void initState() {
    super.initState();
    final profile = ref.read(localProfileProvider);
    _nameController = TextEditingController(text: profile.name);
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(localProfileProvider);
    final controller = ref.read(localProfileProvider.notifier);
    final colors = context.appColors;

    return SettingsGroup(
      children: [
        SettingsRow(
          title: 'Display Name',
          subtitle: 'Your name shown in the sidebar header',
          control: Row(
            children: [
              Expanded(
                child: ShadInput(
                  controller: _nameController,
                  placeholder: const Text('Local User'),
                  onSubmitted: (val) {
                    controller.setName(
                      val.trim().isEmpty ? 'Local User' : val.trim(),
                    );
                  },
                ),
              ),
              const SizedBox(width: 8),
              ShadButton.outline(
                height: 40,
                onPressed: () {
                  final text = _nameController.text.trim();
                  controller.setName(text.isEmpty ? 'Local User' : text);
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(const SnackBar(content: Text('Name saved!')));
                },
                child: const Text('Save'),
              ),
            ],
          ),
        ),
        SettingsRow(
          title: 'Avatar Emoji',
          subtitle: 'Current: ${profile.emoji}',
          control: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final emoji in _quickEmojis)
                InkWell(
                  borderRadius: BorderRadius.circular(6),
                  onTap: () => controller.setEmoji(emoji),
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: profile.emoji == emoji
                          ? colors.accent.withAlpha(40)
                          : colors.surfaceHover,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: profile.emoji == emoji
                            ? colors.accent
                            : colors.border,
                      ),
                    ),
                    child: Text(emoji, style: const TextStyle(fontSize: 16)),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
