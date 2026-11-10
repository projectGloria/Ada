import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/providers.dart';
import 'package:ada/data/repositories/habits/habit_repository.dart';
import 'package:ada/data/repositories/habits/habit_repository_impl.dart';
import 'package:ada/domain/models/habits/habit_models.dart';

final habitRepositoryProvider = Provider<HabitRepository>(
  (ref) => DriftHabitRepository(
    ref.watch(appDatabaseProvider),
    ref.watch(syncQueueRepositoryProvider),
  ),
);
final habitsProvider = StreamProvider<List<Habit>>(
  (ref) => ref.watch(habitRepositoryProvider).watchHabits(),
);
final habitCheckInsProvider = StreamProvider<List<HabitCheckIn>>(
  (ref) => ref.watch(habitRepositoryProvider).watchCheckIns(),
);
