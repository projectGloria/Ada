import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/account_providers.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/data/repositories/tasks/csv_task_export_repository.dart';
import 'package:ada/data/repositories/tasks/csv_task_export_repository_impl.dart';
import 'package:ada/data/services/files/csv_task_export_service.dart';

final csvTaskExportRepositoryProvider = Provider<CsvTaskExportRepository>((
  ref,
) {
  final sessions = ref.watch(accountSessionRepositoryProvider);
  return DriftCsvTaskExportRepository(
    CsvTaskExportService(ref.watch(appDatabaseProvider)),
    currentSession: () => sessions.currentSession,
    now: ref.watch(clockProvider).now,
  );
});
