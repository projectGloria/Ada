import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/domain/models/focus/ambient_sound.dart';

const _ambientTrackKey = 'focus.ambient_sound.track';
const _ambientVolumeKey = 'focus.ambient_sound.volume';
const _ambientAutoPlayKey = 'focus.ambient_sound.autoplay';

class AmbientSoundState {
  const AmbientSoundState({
    this.track = AmbientSoundTrack.none,
    this.volume = 0.5,
    this.autoPlay = true,
    this.isPlaying = false,
  });

  final AmbientSoundTrack track;
  final double volume;
  final bool autoPlay;
  final bool isPlaying;

  AmbientSoundState copyWith({
    AmbientSoundTrack? track,
    double? volume,
    bool? autoPlay,
    bool? isPlaying,
  }) => AmbientSoundState(
    track: track ?? this.track,
    volume: volume ?? this.volume,
    autoPlay: autoPlay ?? this.autoPlay,
    isPlaying: isPlaying ?? this.isPlaying,
  );
}

final ambientSoundControllerProvider =
    NotifierProvider<AmbientSoundController, AmbientSoundState>(
      AmbientSoundController.new,
    );

class AmbientSoundController extends Notifier<AmbientSoundState> {
  AudioPlayer? _player;
  SharedPreferences? _prefs;

  @override
  AmbientSoundState build() {
    _player ??= AudioPlayer();
    _initPrefs();

    ref.listen(activeFocusIntervalProvider, (previous, next) {
      final interval = next.value;
      if (interval == null) {
        pause();
        return;
      }
      if (state.autoPlay && state.track != AmbientSoundTrack.none) {
        if (interval.type == 'work' && interval.status == 'running') {
          play();
        } else if (interval.status == 'paused' || interval.type == 'break') {
          pause();
        }
      }
    });

    ref.onDispose(() {
      _player?.dispose();
      _player = null;
    });

    return const AmbientSoundState();
  }

  Future<void> _initPrefs() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      final trackVal = _prefs?.getString(_ambientTrackKey);
      final volVal = _prefs?.getDouble(_ambientVolumeKey) ?? 0.5;
      final autoPlayVal = _prefs?.getBool(_ambientAutoPlayKey) ?? true;
      final track = AmbientSoundTrack.fromStorageValue(trackVal);
      state = state.copyWith(
        track: track,
        volume: volVal,
        autoPlay: autoPlayVal,
      );
    } catch (_) {}
  }

  Future<void> setTrack(AmbientSoundTrack track) async {
    state = state.copyWith(track: track);
    await _prefs?.setString(_ambientTrackKey, track.storageValue);
    if (track == AmbientSoundTrack.none) {
      await stop();
    } else if (state.isPlaying) {
      await _startPlayback(track);
    }
  }

  Future<void> setVolume(double volume) async {
    final v = volume.clamp(0.0, 1.0);
    state = state.copyWith(volume: v);
    await _prefs?.setDouble(_ambientVolumeKey, v);
    await _player?.setVolume(v);
  }

  Future<void> setAutoPlay(bool autoPlay) async {
    state = state.copyWith(autoPlay: autoPlay);
    await _prefs?.setBool(_ambientAutoPlayKey, autoPlay);
  }

  Future<void> play() async {
    if (state.track == AmbientSoundTrack.none) return;
    await _startPlayback(state.track);
  }

  Future<void> _startPlayback(AmbientSoundTrack track) async {
    final assetPath = track.assetPath;
    if (assetPath == null) return;
    try {
      await _player?.stop();
      await _player?.setReleaseMode(ReleaseMode.loop);
      await _player?.setVolume(state.volume);
      await _player?.play(AssetSource(assetPath));
      state = state.copyWith(isPlaying: true);
    } catch (_) {
      // Audio playback best effort
    }
  }

  Future<void> pause() async {
    try {
      await _player?.pause();
      state = state.copyWith(isPlaying: false);
    } catch (_) {}
  }

  Future<void> resume() async {
    if (state.track == AmbientSoundTrack.none) return;
    try {
      await _player?.resume();
      state = state.copyWith(isPlaying: true);
    } catch (_) {
      await play();
    }
  }

  Future<void> stop() async {
    try {
      await _player?.stop();
      state = state.copyWith(isPlaying: false);
    } catch (_) {}
  }

  Future<void> togglePlay() async {
    if (state.isPlaying) {
      await pause();
    } else {
      if (state.track == AmbientSoundTrack.none) {
        await setTrack(AmbientSoundTrack.rain);
      }
      await play();
    }
  }
}
