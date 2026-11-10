import 'package:ada/utils/result.dart';

import 'package:ada/domain/models/productivity/productivity_models.dart';

abstract interface class ProductivityRepository {
  Stream<ProductivitySummary> watchTodaySummary();
  Future<Result<void>> recalculateDailyStats(DateTime localDate);
}
