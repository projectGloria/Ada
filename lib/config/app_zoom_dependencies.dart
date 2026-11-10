import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/task_preferences_dependencies.dart';
import 'package:ada/data/repositories/settings/app_zoom_repository.dart';
import 'package:ada/data/repositories/settings/app_zoom_repository_impl.dart';

final appZoomRepositoryProvider = Provider<AppZoomRepository>(
  (ref) => LocalAppZoomRepository(ref.watch(preferencesServiceProvider)),
);
