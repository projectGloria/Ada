import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart'
    show LucideIcons, ShadButton, ShadOption, ShadSelect, ShadSwitch;

import 'package:ada/data/services/audio/ambient_sound_player.dart';
import 'package:ada/domain/models/focus/ambient_sound.dart';
import 'package:ada/ui/core/themes/app_theme.dart';
import 'package:ada/ui/settings/widgets/settings_components.dart';

class AmbientSoundSettingsCard extends ConsumerWidget {
  const AmbientSoundSettingsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ambientSoundControllerProvider);
    final controller = ref.read(ambientSoundControllerProvider.notifier);
    final colors = context.appColors;

    return SettingsGroup(
      children: [
        SettingsRow(
          title: 'Ambient Focus Sounds',
          subtitle:
              'Choose a background ambiance to play automatically during focus',
          control: ShadSelect<AmbientSoundTrack>(
            key: ValueKey(state.track),
            initialValue: state.track,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            options: [
              for (final track in AmbientSoundTrack.values)
                ShadOption(
                  value: track,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(track.icon, size: 16),
                      const SizedBox(width: 8),
                      Text(track.displayName),
                    ],
                  ),
                ),
            ],
            selectedOptionBuilder: (context, track) => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(track.icon, size: 16),
                const SizedBox(width: 8),
                Text(track.displayName),
              ],
            ),
            onChanged: (track) {
              if (track != null) {
                controller.setTrack(track);
              }
            },
          ),
        ),
        if (state.track != AmbientSoundTrack.none) ...[
          SettingsRow(
            title: 'Ambient Volume',
            subtitle: '${(state.volume * 100).round()}%',
            control: Row(
              children: [
                Icon(
                  state.volume == 0
                      ? LucideIcons.volumeX
                      : state.volume < 0.5
                      ? LucideIcons.volume1
                      : LucideIcons.volume2,
                  size: 18,
                  color: colors.secondaryText,
                ),
                Expanded(
                  child: Slider(
                    value: state.volume,
                    min: 0.0,
                    max: 1.0,
                    divisions: 20,
                    activeColor: colors.accent,
                    onChanged: controller.setVolume,
                  ),
                ),
              ],
            ),
          ),
          SettingsRow(
            title: 'Auto-play during focus',
            subtitle: 'Starts when focus begins and pauses during breaks',
            control: ShadSwitch(
              value: state.autoPlay,
              onChanged: controller.setAutoPlay,
            ),
          ),
          SettingsRow(
            title: 'Preview Audio',
            subtitle: state.isPlaying ? 'Playing in loop' : 'Audio stopped',
            control: ShadButton.outline(
              height: 40,
              onPressed: controller.togglePlay,
              leading: Icon(
                state.isPlaying ? LucideIcons.pause : LucideIcons.play,
                size: 16,
              ),
              child: Text(state.isPlaying ? 'Pause' : 'Test Sound'),
            ),
          ),
        ],
      ],
    );
  }
}
