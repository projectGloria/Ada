import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/config/productivity_dependencies.dart';
import 'package:ada/data/repositories/achievements/achievement_announcement_repository.dart';
import 'package:ada/data/repositories/achievements/achievement_repository.dart';
import 'package:ada/domain/models/productivity/achievement_models.dart';
import 'package:ada/utils/result.dart';

final achievementAnnouncementBridgeViewModelProvider =
    NotifierProvider.autoDispose<
      AchievementAnnouncementBridgeViewModel,
      AsyncValue<void>
    >(AchievementAnnouncementBridgeViewModel.new);

class AchievementAnnouncementBridgeViewModel
    extends Notifier<AsyncValue<void>> {
  late AchievementRepository _repository;
  late AchievementAnnouncementRepository _announcements;
  @override
  AsyncValue<void> build() {
    _repository = ref.watch(achievementRepositoryProvider);
    _announcements = ref.watch(achievementAnnouncementRepositoryProvider);
    ref.listen(achievementsProvider, (_, next) {
      if (next.value case final items?) unawaited(_queue(items));
    });
    return const AsyncData(null);
  }

  Future<void> _queue(List<AchievementItem> items) async {
    final result = await _repository.takePendingAnnouncements(items);
    if (!ref.mounted) return;
    switch (result) {
      case Success(:final value):
        _announcements.enqueue(value);
      case Failure(:final error, :final stackTrace):
        state = AsyncError(error, stackTrace);
    }
  }
}

final achievementAnnouncementViewModelProvider = NotifierProvider.autoDispose
    .family<
      AchievementAnnouncementViewModel,
      AchievementItem?,
      AchievementPresentation
    >(AchievementAnnouncementViewModel.new);

class AchievementAnnouncementViewModel extends Notifier<AchievementItem?> {
  AchievementAnnouncementViewModel(this.presentation);
  final AchievementPresentation presentation;
  late AchievementAnnouncementRepository _repository;
  @override
  AchievementItem? build() {
    _repository = ref.watch(achievementAnnouncementRepositoryProvider);
    return _current(ref.watch(achievementAnnouncementStateProvider));
  }

  AchievementItem? _current(AchievementAnnouncementState announcements) =>
      announcements.current?.presentation == presentation
      ? announcements.current
      : null;

  void dismissCurrent() => _repository.dismissCurrent();
}
