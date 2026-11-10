import 'package:ada/config/runtime_public_config.dart';
import 'package:ada/config/sentry_observability.dart';

Future<SentryRuntimePolicy> loadSentryRuntimePolicy() async {
  return SentryRuntimePolicy.fromValues(
    environment: const String.fromEnvironment(
      'ADA_ENVIRONMENT',
      defaultValue: 'local',
    ),
    release: const String.fromEnvironment(
      'ADA_RELEASE',
      defaultValue: 'development',
    ),
    sentryDsn: const String.fromEnvironment('SENTRY_DSN'),
  );
}

Future<RuntimePublicConfig> loadRuntimePublicConfig() async {
  return RuntimePublicConfig.fromBuildTime();
}
