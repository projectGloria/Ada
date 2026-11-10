import 'package:flutter/widgets.dart';
import 'package:shadcn_ui/shadcn_ui.dart' show LucideIcons;

enum AmbientSoundTrack {
  none('none', 'Off', LucideIcons.volumeX),
  rain('rain', 'Gentle Rain', LucideIcons.cloudRain),
  whiteNoise('white_noise', 'White Noise', LucideIcons.wind),
  campfire('campfire', 'Cozy Campfire', LucideIcons.flame),
  clockwork('clockwork', 'Clockwork Tick', LucideIcons.clock),
  stream('stream', 'Forest Stream', LucideIcons.waves);

  const AmbientSoundTrack(this.storageValue, this.displayName, this.icon);

  final String storageValue;
  final String displayName;
  final IconData icon;

  String? get assetPath =>
      this == none ? null : 'sounds/ambient/$storageValue.wav';

  static AmbientSoundTrack fromStorageValue(Object? value) => switch (value) {
    'rain' => rain,
    'white_noise' => whiteNoise,
    'campfire' => campfire,
    'clockwork' => clockwork,
    'stream' => stream,
    _ => none,
  };
}
