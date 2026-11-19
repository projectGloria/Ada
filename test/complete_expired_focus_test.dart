import 'package:flutter_test/flutter_test.dart';
import 'package:ada/data/repositories/focus/focus_repository.dart';
import 'package:ada/domain/models/focus/focus_models.dart';
import 'package:ada/domain/use_cases/focus/complete_expired_focus_interval_use_case.dart';
import 'package:ada/utils/result.dart';

class FakeFocusRepository implements FocusRepository {
  DateTime? capturedCompletedNow;
  String? capturedExpiredIntervalId;

  @override
  Future<Result<void>> completeActiveInterval({
    DateTime? now,
    String? expiredIntervalId,
  }) async {
    capturedCompletedNow = now;
    capturedExpiredIntervalId = expiredIntervalId;
    return const Result.ok(null);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('CompleteExpiredFocusIntervalUseCase', () {
    test('uses expectedEndAt rather than wake time when completing expired interval', () async {
      final fakeRepo = FakeFocusRepository();
      final useCase = CompleteExpiredFocusIntervalUseCase(fakeRepo);

      final startedAt = DateTime.utc(2026, 1, 1, 9, 0); // 09:00:00
      const plannedSeconds = 1500; // 25 minutes -> expected 09:25:00
      const pausedTotalSeconds = 60; // 1 min paused -> expected 09:26:00

      final interval = FocusIntervalItem(
        id: 'interval-123',
        runId: 'run-456',
        type: 'work',
        status: 'running',
        plannedSeconds: plannedSeconds,
        startedAt: startedAt,
        pausedTotalSeconds: pausedTotalSeconds,
        sequenceNumber: 1,
        createdAt: startedAt,
        updatedAt: startedAt,
      );

      // App opened 5 hours later at 14:00:00
      final wakeTime = DateTime.utc(2026, 1, 1, 14, 0);

      await useCase(interval, wakeTime);

      expect(fakeRepo.capturedExpiredIntervalId, 'interval-123');
      // Must NOT be the wakeTime (14:00)
      expect(fakeRepo.capturedCompletedNow, isNot(equals(wakeTime)));
      // Must be exactly 09:00 + 25m + 1m = 09:26:00
      expect(
        fakeRepo.capturedCompletedNow,
        DateTime.utc(2026, 1, 1, 9, 26),
      );
    });
  });
}
