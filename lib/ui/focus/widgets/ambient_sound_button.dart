import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart' show LucideIcons;

import 'package:ada/data/services/audio/ambient_sound_player.dart';
import 'package:ada/domain/models/focus/ambient_sound.dart';
import 'package:ada/ui/core/themes/app_theme.dart';

class AmbientSoundButton extends ConsumerWidget {
  const AmbientSoundButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ambientSoundControllerProvider);
    final colors = context.appColors;

    final icon = state.track == AmbientSoundTrack.none
        ? LucideIcons.volumeX
        : state.track.icon;

    return IconButton(
      tooltip: 'Ambient Sound: ${state.track.displayName}',
      constraints: const BoxConstraints.tightFor(width: 44, height: 44),
      color: state.track == AmbientSoundTrack.none
          ? colors.secondaryText
          : colors.accent,
      icon: Icon(icon, size: 18),
      onPressed: () => showDialog<void>(
        context: context,
        builder: (ctx) => const _AmbientSoundDialog(),
      ),
    );
  }
}

class _AmbientSoundDialog extends ConsumerWidget {
  const _AmbientSoundDialog();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ambientSoundControllerProvider);
    final controller = ref.read(ambientSoundControllerProvider.notifier);
    final colors = context.appColors;

    return AlertDialog(
      title: const Row(
        children: [
          Icon(LucideIcons.headphones, size: 20),
          SizedBox(width: 8),
          Text('Ambient Focus Sounds'),
        ],
      ),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final track in AmbientSoundTrack.values)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                selected: state.track == track,
                selectedTileColor: colors.surfaceHover,
                leading: Icon(
                  track.icon,
                  size: 18,
                  color: state.track == track ? colors.accent : colors.secondaryText,
                ),
                title: Text(
                  track.displayName,
                  style: TextStyle(
                    fontWeight: state.track == track ? FontWeight.w600 : FontWeight.normal,
                    color: state.track == track ? colors.accent : colors.primaryText,
                  ),
                ),
                trailing: state.track == track && state.isPlaying
                    ? Icon(LucideIcons.volume2, size: 16, color: colors.accent)
                    : null,
                onTap: () {
                  controller.setTrack(track);
                  if (track != AmbientSoundTrack.none) {
                    controller.play();
                  }
                },
              ),
            if (state.track != AmbientSoundTrack.none) ...[
              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('Volume:', style: TextStyle(fontSize: 13)),
                  const SizedBox(width: 8),
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
                  Text('${(state.volume * 100).round()}%',
                      style: const TextStyle(fontSize: 12)),
                ],
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
