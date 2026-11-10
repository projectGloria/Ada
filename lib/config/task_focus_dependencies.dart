import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/domain/use_cases/focus/task_focus_launcher.dart';

final taskFocusLauncherProvider = Provider(
  (ref) => TaskFocusLauncher(ref.watch(focusRepositoryProvider)),
);
