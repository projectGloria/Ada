import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/habit_dependencies.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/config/app_language.dart';
import 'package:ada/domain/models/notifications/habit_reminder_status.dart';
import 'package:ada/domain/models/habits/habit_models.dart';

final habitReminderStatusProvider =
    NotifierProvider<HabitNotificationCoordinator, HabitReminderStatus>(
      HabitNotificationCoordinator.new,
    );

class HabitNotificationCoordinator extends Notifier<HabitReminderStatus> {
  int _revision = 0;
  bool _disposed = false;
  @override
  HabitReminderStatus build() {
    _disposed = false;
    ref.listen(habitsProvider, (_, _) => refresh());
    ref.listen(habitCheckInsProvider, (_, _) => refresh());
    ref.listen(appLanguageProvider, (_, _) => refresh());
    var calendar = _calendar();
    final timer = Timer.periodic(const Duration(minutes: 1), (_) {
      final latest = _calendar();
      if (calendar != latest) {
        calendar = latest;
        unawaited(refresh());
      }
    });
    final lifecycle = AppLifecycleListener(onResume: refresh);
    ref.onDispose(() {
      _disposed = true;
      _revision++;
      timer.cancel();
      lifecycle.dispose();
    });
    unawaited(Future.microtask(refresh));
    return HabitReminderStatus.available;
  }

  String _calendar() {
    final now = ref.read(clockProvider).now().toLocal();
    return '${habitDayKey(now)}:${now.timeZoneName}:${now.timeZoneOffset.inMinutes}';
  }

  Future<void> refresh() async {
    if (_disposed) return;
    final habits = ref.read(habitsProvider).value;
    final checkIns = ref.read(habitCheckInsProvider).value;
    if (habits == null || checkIns == null) return;
    final revision = ++_revision;
    final result = await ref
        .read(notificationRepositoryProvider)
        .syncHabitNotifications(
          habits: habits,
          checkIns: checkIns,
          now: ref.read(clockProvider).now(),
        );
    if (!_disposed && revision == _revision) state = result;
  }
}
