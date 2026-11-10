import 'package:flutter_test/flutter_test.dart';
import 'package:ada/utils/timer_engine.dart';

void main() {
  final start = DateTime.utc(2026, 1, 1, 12);

  test('remaining time subtracts elapsed and paused seconds', () {
    expect(
      calculateRemaining(
        now: start.add(const Duration(minutes: 10)),
        startedAt: start,
        plannedSeconds: 1500,
        pausedTotalSeconds: 120,
      ),
      const Duration(seconds: 1500 - 600 + 120),
    );
  });

  test('a paused interval is frozen at its pause time', () {
    expect(
      calculateRemaining(
        now: start.add(const Duration(hours: 3)),
        startedAt: start,
        plannedSeconds: 1500,
        pausedTotalSeconds: 0,
        pausedAt: start.add(const Duration(minutes: 5)),
      ),
      const Duration(seconds: 1200),
    );
  });

  test('remaining time is clamped to [0, planned]', () {
    expect(
      isIntervalExpired(
        now: start.add(const Duration(hours: 1)),
        startedAt: start,
        plannedSeconds: 60,
        pausedTotalSeconds: 0,
      ),
      isTrue,
    );
    expect(
      calculateRemaining(
        now: start.subtract(const Duration(hours: 1)),
        startedAt: start,
        plannedSeconds: 60,
        pausedTotalSeconds: 0,
      ),
      const Duration(seconds: 60),
    );
  });
}
