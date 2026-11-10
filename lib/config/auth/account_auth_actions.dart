import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/config/account_providers.dart';
import 'package:ada/config/auth/email_auth.dart';
import 'package:ada/data/repositories/account/account_auth_actions_repository.dart';
import 'package:ada/data/services/auth/account_auth_errors.dart';
import 'package:ada/data/services/platform/native_captcha_broker.dart';
import 'package:ada/domain/models/account/account_auth_failure.dart';
import 'package:ada/domain/models/account/social_provider.dart';

final accountAuthActionsRepositoryProvider =
    Provider<AccountAuthActionsRepository>((ref) {
      return DefaultAccountAuthActionsRepository(
        classifier: classifyAccountAuthFailure,
        socialSignIn: (provider, redirectTo) async {
          final account = ref.read(accountClientProvider);
          if (account == null) {
            throw const AccountAuthFailure(
              AccountAuthFailureKind.serviceUnavailable,
              field: AccountAuthField.form,
              recovery: AccountAuthRecovery.retry,
            );
          }
          switch (provider) {
            case AdaSocialProvider.apple:
              await account.signInWithApple(redirectTo: redirectTo);
            case AdaSocialProvider.google:
              await account.signInWithGoogle(redirectTo: redirectTo);
          }
          return account.currentUserId != null;
        },
        nativeCaptcha: (locale) async {
          if (kIsWeb) return null;
          final callbacks = ref
              .read(nativeLinkCoordinatorProvider)
              ?.captchaCallbacks;
          if (callbacks == null) {
            throw const AccountAuthFailure(
              AccountAuthFailureKind.captchaUnavailable,
              field: AccountAuthField.captcha,
              recovery: AccountAuthRecovery.retryCaptcha,
            );
          }
          final broker = NativeCaptchaBroker(uriStream: callbacks);
          try {
            return await broker.requestToken(locale: locale);
          } finally {
            broker.dispose();
          }
        },
        emailSubmit:
            ({
              required action,
              required email,
              required password,
              required redirectTo,
              captchaToken,
            }) => ref
                .read(emailAuthProvider)
                .submit(
                  action: action,
                  email: email,
                  password: password,
                  redirectTo: redirectTo,
                  captchaToken: captchaToken,
                ),
      );
    });
