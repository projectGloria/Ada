import 'package:drift/drift.dart';

import 'package:ada/data/services/local/database/app_database.dart';

typedef ProjectWithScope = ({ProjectRow project, SharedScopeRow? scope});

class ProjectLocalService {
  ProjectLocalService(this._db);

  final AppDatabase _db;

  Stream<List<ProjectWithScope>> watchActiveProjects() {
    final statement = _db.select(_db.projects)
      ..where((project) => project.isDeleted.equals(false))
      ..orderBy([
        (project) => OrderingTerm.asc(project.orderKey),
        (project) => OrderingTerm.asc(project.id),
      ]);
    return statement
        .join([
          leftOuterJoin(
            _db.sharedScopes,
            _db.sharedScopes.id.equalsExp(_db.projects.scopeId),
          ),
        ])
        .watch()
        .map(
          (rows) => [
            for (final result in rows)
              (
                project: result.readTable(_db.projects),
                scope: result.readTableOrNull(_db.sharedScopes),
              ),
          ],
        );
  }

  Future<List<ProjectRow>> activeProjects() {
    return (_db.select(
      _db.projects,
    )..where((project) => project.isDeleted.equals(false))).get();
  }

  Future<void> insertProject(ProjectsCompanion project) {
    return _db.into(_db.projects).insert(project);
  }

  Future<void> updateProject(String id, ProjectsCompanion patch) {
    return (_db.update(
      _db.projects,
    )..where((project) => project.id.equals(id))).write(patch);
  }

  Future<ProjectRow?> findActiveProject(String id) {
    return (_db.select(_db.projects)
          ..where(
            (project) =>
                project.id.equals(id) & project.isDeleted.equals(false),
          )
          ..limit(1))
        .getSingleOrNull();
  }

  Future<void> setProjectDeleted(String id, DateTime updatedAt) {
    return updateProject(
      id,
      ProjectsCompanion(
        isDeleted: const Value(true),
        updatedAt: Value(updatedAt),
      ),
    );
  }

  Future<List<TaskRow>> activeTasksForProject(String projectId) {
    return (_db.select(_db.tasks)..where(
          (task) =>
              task.projectId.equals(projectId) & task.isDeleted.equals(false),
        ))
        .get();
  }

  Future<void> moveTaskToProject(
    String taskId,
    String projectId,
    DateTime updatedAt,
  ) {
    return (_db.update(
      _db.tasks,
    )..where((task) => task.id.equals(taskId))).write(
      TasksCompanion(
        projectId: Value(projectId),
        sectionId: const Value(null),
        updatedAt: Value(updatedAt),
      ),
    );
  }

  /// Soft-deletes the project's live sections and returns their ids, so the
  /// caller can enqueue matching `section.delete` sync commands. Sections that
  /// were already deleted keep their original `updatedAt`.
  Future<List<String>> setSectionsDeletedForProject(
    String projectId,
    DateTime updatedAt,
  ) async {
    final live =
        await (_db.select(_db.sections)..where(
              (section) =>
                  section.projectId.equals(projectId) &
                  section.isDeleted.equals(false),
            ))
            .get();
    if (live.isEmpty) return const [];
    final ids = [for (final row in live) row.id];
    await (_db.update(
      _db.sections,
    )..where((section) => section.id.isIn(ids))).write(
      SectionsCompanion(
        isDeleted: const Value(true),
        updatedAt: Value(updatedAt),
      ),
    );
    return ids;
  }

  Future<KanbanSettingsRow> loadKanbanSettings() {
    return (_db.select(
      _db.kanbanSettings,
    )..where((row) => row.id.equals(kanbanSettingsPrimaryId))).getSingle();
  }

  Future<void> repairKanbanSettings({required DateTime now}) {
    return _db.repairKanbanSettings(now: now);
  }
}
