import 'package:flutter/foundation.dart';

final _reported = <String>{};

/// Reports a failure from background work (timers, best-effort coordinators)
/// through [FlutterError.reportError], which the app's Sentry integration
/// receives. Each distinct [context] + error type is reported once per process
/// so a job that fails every minute does not flood the logs.
void reportBackgroundFailure(Object error, StackTrace stack, String context) {
  if (!_reported.add('$context:${error.runtimeType}')) return;
  FlutterError.reportError(
    FlutterErrorDetails(
      exception: error,
      stack: stack,
      library: 'ada background',
      context: ErrorDescription(context),
    ),
  );
}
