import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/account_providers.dart';
import 'package:ada/config/app_language.dart';
import 'package:ada/config/focus_dependencies.dart';
import 'package:ada/config/habit_dependencies.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/config/runtime_public_config.dart';
import 'package:ada/data/services/platform/watch_companion_service.dart';
import 'package:ada/domain/use_cases/platform/watch_companion_use_case.dart';
import 'package:ada/domain/use_cases/quick_add/voice_quick_add_use_case.dart';
import 'package:ada/ui/core/localization/app_locale.dart';

final watchCompanionServiceProvider = Provider<WatchCompanionService>((ref) {
  ref.watch(accountSessionProvider);
  final selectedPresetId = ref.watch(lastFocusPresetIdProvider);
  final account = ref.watch(accountClientProvider);
  final language = ref.watch(appLanguageProvider);
  final runtime = ref.watch(runtimePublicConfigProvider);
  final voiceQuickAdd = VoiceQuickAddUseCase(
    quickAdd: ref.watch(quickAddUseCaseProvider),
    runLocalTransaction: ref.watch(localTransactionProvider),
  );
  final actions = WatchCompanionUseCase(
    taskRepository: ref.watch(taskRepositoryProvider),
    projectRepository: ref.watch(projectRepositoryProvider),
    focusRepository: ref.watch(focusRepositoryProvider),
    habitRepository: ref.watch(habitRepositoryProvider),
    productivityRepository: ref.watch(productivityRepositoryProvider),
    quickAddService: ref.watch(quickAddUseCaseProvider),
    voiceQuickAdd: voiceQuickAdd,
    taskDecomposer: ref.watch(taskDecomposerProvider),
    localeProvider: () => resolveAppLocale(language).toLanguageTag(),
    selectedFocusPresetIdProvider: () => selectedPresetId,
  );
  final service = WatchCompanionService(
    execute: actions.execute,
    snapshot: actions.buildSnapshot,
    snapshotChanges: actions.snapshotChanges,
    accountSessionProvider: () => watchAccountSessionPayload(
      account?.currentSession,
      environment: runtime.environment.name,
      release: runtime.release,
      webAppUrl: runtime.webAppUrl.toString(),
      supabaseUrl: runtime.supabaseUrl?.toString(),
      supabaseAnonKey: runtime.supabaseAnonKey,
      turnstileSiteKey: runtime.turnstileSiteKey,
      sentryDsn: runtime.sentryDsn?.toString(),
    ),
  );
  service.start();
  ref.onDispose(service.dispose);
  return service;
});
