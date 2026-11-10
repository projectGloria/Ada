import 'dart:js_interop';

import 'package:ada/config/runtime_public_config.dart';
import 'package:ada/config/runtime_public_config_loader_core.dart';
import 'package:ada/config/sentry_observability.dart';
import 'package:ada/domain/models/app_flavor.dart';

@JS('window.adaRuntimeConfig')
external JSAny? get _preloadedRuntimeConfig;

Future<SentryRuntimePolicy> loadSentryRuntimePolicy() async {
  final preloaded = _preloadedRuntimeConfig;
  if (preloaded != null) {
    return parsePreloadedSentryRuntimePolicy(preloaded.dartify());
  }
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
  final preloaded = _preloadedRuntimeConfig;
  final config = preloaded != null
      ? parsePreloadedRuntimePublicConfig(preloaded.dartify())
      : _buildTimeRuntimePublicConfig();
  // The image is built once and deployed to every environment, so the flavor
  // comes from the deployed configuration rather than from `--flavor`.
  setAppFlavor(appFlavorForRuntimeEnvironment(config.environment));
  return config;
}

RuntimePublicConfig _buildTimeRuntimePublicConfig() {
  final buildTime = RuntimePublicConfig.fromBuildTime();
  if (buildTime.environment == RuntimeEnvironment.local ||
      buildTime.environment == RuntimeEnvironment.selfhosted) {
    return buildTime;
  }
  throw const FormatException(
    'window.adaRuntimeConfig is required outside local development',
  );
}
