import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _localProfileNameKey = 'profile.local_name';
const _localProfileEmojiKey = 'profile.local_emoji';

class LocalProfile {
  const LocalProfile({this.name, this.emoji});
  final String? name;
  final String? emoji;

  LocalProfile copyWith({String? name, String? emoji}) => LocalProfile(
    name: name ?? this.name,
    emoji: emoji ?? this.emoji,
  );
}

final localProfileProvider =
    NotifierProvider<LocalProfileNotifier, LocalProfile>(
      LocalProfileNotifier.new,
    );

class LocalProfileNotifier extends Notifier<LocalProfile> {
  SharedPreferences? _prefs;

  @override
  LocalProfile build() {
    _init();
    return const LocalProfile(name: null, emoji: null);
  }

  Future<void> _init() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      final n = _prefs?.getString(_localProfileNameKey);
      final e = _prefs?.getString(_localProfileEmojiKey);
      state = LocalProfile(name: n, emoji: e);
    } catch (_) {}
  }

  Future<void> setName(String name) async {
    final trimmed = name.trim();
    state = state.copyWith(name: trimmed.isEmpty ? null : trimmed);
    if (trimmed.isEmpty) {
      await _prefs?.remove(_localProfileNameKey);
    } else {
      await _prefs?.setString(_localProfileNameKey, trimmed);
    }
  }

  Future<void> setEmoji(String? emoji) async {
    state = state.copyWith(emoji: emoji);
    if (emoji == null || emoji.isEmpty) {
      await _prefs?.remove(_localProfileEmojiKey);
    } else {
      await _prefs?.setString(_localProfileEmojiKey, emoji);
    }
  }
}
