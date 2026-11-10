import 'package:ada/config/habit_notification_dependencies.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:ada/config/account_providers.dart';
import 'package:ada/config/platform/watch_companion.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/config/distraction_dependencies.dart';

/// Keeps application-lifetime service subscriptions alive while mounted.
///
/// This is composition, not presentation: the UI only observes whether startup
/// finished, while these source-owning providers stay subscribed for as long as
/// the application scope exists.
final startupBackgroundWiringProvider = Provider<void>((ref) {
  ref.watch(accountSyncLifecycleProvider);
  ref.watch(protectionCoordinatorProvider);
  ref.watch(recurringTaskMaterializationProvider);
  ref.watch(taskStartNotificationCoordinatorProvider);
  ref.watch(habitReminderStatusProvider);
  ref.watch(reengagementNotificationCoordinatorProvider);
  ref.watch(watchCompanionServiceProvider);
});
