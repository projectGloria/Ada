import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/account_providers.dart';
import 'package:ada/config/agent_app_settings_dependencies.dart';
import 'package:ada/config/app_language.dart';
import 'package:ada/config/platform/platform_quick_add.dart';
import 'package:ada/domain/models/settings/app_language.dart';

final class AppViewState {
  const AppViewState({required this.language});

  final AppLanguage language;
}

final appViewModelProvider = Provider<AppViewState>((ref) {
  ref.watch(agentAppSettingsRuntimeProvider);
  ref.watch(accountLocaleSyncProvider);
  ref.watch(globalQuickAddRepositoryProvider);
  return AppViewState(language: ref.watch(appLanguageProvider));
});
