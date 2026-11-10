import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/runtime_public_config.dart';

final captchaChallengeSiteKeyProvider = Provider<String>(
  (ref) => ref.watch(runtimePublicConfigProvider).turnstileSiteKey,
);
