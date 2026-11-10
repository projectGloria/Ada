import 'package:ada/utils/result.dart';

import 'package:ada/domain/models/productivity/achievement_models.dart';

abstract interface class AchievementRepository {
  Stream<List<AchievementItem>> watchAchievements();

  Future<Result<List<AchievementItem>>> takePendingAnnouncements(
    List<AchievementItem> items,
  );
}
