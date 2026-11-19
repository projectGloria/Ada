import 'package:flutter_test/flutter_test.dart';
import 'package:ada/domain/models/tasks/task_models.dart';

void main() {
  group('TaskRecurrence calculations', () {
    test('daily recurrence preserves exact clock hour and minute', () {
      final start = DateTime(2026, 3, 28, 9, 30);
      final schedule = TaskSchedule.timed(
        start: start,
        end: start.add(const Duration(hours: 1)),
        recurrence: const TaskRecurrence(
          interval: 1,
          unit: TaskRecurrenceUnit.day,
          seriesId: 'series-daily',
        ),
      );

      final next = schedule.nextOccurrence();
      final local = next.occurrenceStartLocal;
      expect(local.year, 2026);
      expect(local.month, 3);
      expect(local.day, 29);
      expect(local.hour, 9);
      expect(local.minute, 30);
    });

    test('weekly recurrence advances by 7 * interval days with identical time', () {
      final start = DateTime(2026, 4, 1, 14, 15);
      final schedule = TaskSchedule.timed(
        start: start,
        end: start.add(const Duration(hours: 2)),
        recurrence: const TaskRecurrence(
          interval: 2,
          unit: TaskRecurrenceUnit.week,
          seriesId: 'series-weekly',
        ),
      );

      final next = schedule.nextOccurrence();
      final local = next.occurrenceStartLocal;
      expect(local.year, 2026);
      expect(local.month, 4);
      expect(local.day, 15);
      expect(local.hour, 14);
      expect(local.minute, 15);
    });

    test('monthly recurrence clamps in February and restores in March using anchorDay', () {
      final jan31 = DateTime(2026, 1, 31);
      final schedule = TaskSchedule.allDay(
        jan31,
        recurrence: const TaskRecurrence(
          interval: 1,
          unit: TaskRecurrenceUnit.month,
          seriesId: 'series-monthly',
          anchorDay: 31,
        ),
      );

      // Jan 31 -> Feb 28 (2026 is non-leap)
      final feb = schedule.nextOccurrence();
      expect(feb.date!.year, 2026);
      expect(feb.date!.month, 2);
      expect(feb.date!.day, 28);
      expect(feb.recurrence!.anchorDay, 31);

      // Feb 28 -> Mar 31 (anchorDay 31 restored!)
      final mar = feb.nextOccurrence();
      expect(mar.date!.year, 2026);
      expect(mar.date!.month, 3);
      expect(mar.date!.day, 31);
      expect(mar.recurrence!.anchorDay, 31);
    });

    test('TaskRecurrence serialization round-trip includes anchorDay', () {
      const recurrence = TaskRecurrence(
        interval: 3,
        unit: TaskRecurrenceUnit.month,
        seriesId: 'rec-test-1',
        anchorDay: 31,
      );

      final json = recurrence.toJson();
      expect(json['anchorDay'], 31);
      expect(json['interval'], 3);
      expect(json['unit'], 'month');

      final deserialized = TaskRecurrence.fromJson(json);
      expect(deserialized, equals(recurrence));
      expect(deserialized?.anchorDay, 31);
    });
  });
}
