import 'package:ada/data/services/local/database/app_database.dart';

class ProductivityLocalService {
  ProductivityLocalService(this._db);

  final AppDatabase _db;

  Stream<List<TaskRow>> watchTasks() {
    // Deleted tasks and projects stay in the stream on purpose: reports still
    // name the focus time and completions recorded against them.
    return _db.select(_db.tasks).watch();
  }

  Stream<List<ProjectRow>> watchProjects() => _db.select(_db.projects).watch();

  Stream<List<FocusIntervalRow>> watchFocusIntervals() {
    return (_db.select(
      _db.focusIntervals,
    )..where((interval) => interval.isDeleted.equals(false))).watch();
  }

  Stream<List<TaskCompletionRow>> watchTaskCompletions() {
    return _db.select(_db.taskCompletions).watch();
  }

  Future<void> insertDailyStats(FocusDailyStatsCompanion stats) {
    return _db.into(_db.focusDailyStats).insertOnConflictUpdate(stats);
  }

  Future<List<TaskRow>> activeTasks() {
    return (_db.select(
      _db.tasks,
    )..where((task) => task.isDeleted.equals(false))).get();
  }

  Future<List<TaskCompletionRow>> allTaskCompletions() {
    return _db.select(_db.taskCompletions).get();
  }

  Future<List<FocusIntervalRow>> activeFocusIntervals() {
    return (_db.select(
      _db.focusIntervals,
    )..where((interval) => interval.isDeleted.equals(false))).get();
  }
}
