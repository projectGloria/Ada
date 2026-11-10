import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/task_preferences_dependencies.dart';
import 'package:ada/data/repositories/settings/theme_mode_repository.dart';
import 'package:ada/data/repositories/settings/theme_mode_repository_impl.dart';
import 'package:ada/data/services/local/shared_theme_cookie.dart';

typedef SharedThemeCookieReader = String Function();
typedef SharedThemeCookieWriter = void Function(String value);

final sharedThemeCookieReaderProvider = Provider<SharedThemeCookieReader>(
  (ref) => readSharedThemeCookieHeader,
);

final sharedThemeCookieWriterProvider = Provider<SharedThemeCookieWriter>(
  (ref) => writeSharedThemePreference,
);

final themeModeRepositoryProvider = Provider<ThemeModeRepository>(
  (ref) => LocalThemeModeRepository(ref.watch(preferencesServiceProvider)),
);
