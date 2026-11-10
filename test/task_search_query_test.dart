import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ada/data/services/local/database/app_database.dart';
import 'package:ada/data/services/local/task_local_service.dart';
import 'package:ada/domain/models/tasks/task_models.dart';

void main() {
  late AppDatabase db;
  late TaskLocalService service;

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await db.ensureSeedData();
    service = TaskLocalService(db);
    final now = DateTime.utc(2026);
    var order = 0;
    for (final content in [
      'Привет мир',
      'Buy 100% juice',
      'snake_case name',
      'snakeXcase name',
      'Plain Task',
    ]) {
      await db
          .into(db.tasks)
          .insert(
            TasksCompanion.insert(
              id: 'task-${order++}',
              userId: localUserId,
              projectId: inboxProjectId,
              content: content,
              orderKey: '$order',
              createdAt: now,
              updatedAt: now,
            ),
          );
    }
  });

  tearDown(() => db.close());

  Future<List<String>> search(String term) async {
    final rows = await service
        .watchTasks(TaskQuery(kind: TaskQueryKind.search, search: term))
        .first;
    return [for (final row in rows) row.task.content]..sort();
  }

  test('non-ASCII terms are not pre-filtered by case-sensitive LIKE', () async {
    // The SQL layer leaves non-ASCII terms to the repository's Unicode-aware
    // filter, so the differently cased match must not be dropped here.
    expect(await search('привет'), contains('Привет мир'));
  });

  test('ASCII search is case-insensitive', () async {
    expect(await search('plain task'), ['Plain Task']);
  });

  test('% and _ are matched literally', () async {
    expect(await search('100%'), ['Buy 100% juice']);
    expect(await search('snake_case'), ['snake_case name']);
  });
}
