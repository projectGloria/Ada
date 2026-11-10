import 'package:ada/config/distraction_dependencies.dart';
import 'package:ada/utils/startup_diagnostics.dart';
import 'package:ada/config/providers.dart' show focusRepositoryProvider;
import 'package:app_account/app_account.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:multiview_desktop/multiview_desktop.dart';

import 'package:ada/config/account_providers.dart';
import 'package:ada/config/pomo_dependencies.dart';
import 'package:ada/config/app_environment.dart';
import 'package:ada/config/app_language.dart';
import 'package:ada/config/collaboration_dependencies.dart';
import 'package:ada/ui/core/localization/app_locale.dart';
import 'package:ada/ui/core/widgets/ada_app.dart';
import 'package:ada/ui/core/widgets/app_icon_runtime.dart';
import 'package:ada/config/platform/platform_quick_add.dart';
import 'package:ada/config/auth/native_account_startup.dart';
import 'package:ada/data/services/platform/native_link_coordinator.dart';
import 'package:ada/config/runtime_public_config.dart';
import 'package:ada/config/runtime_public_config_loader.dart';
import 'package:ada/config/runtime_public_config_loader_core.dart';
import 'package:ada/config/sentry_observability.dart';
import 'package:ada/data/services/platform/web_bootstrap_loader.dart';
import 'package:ada/domain/use_cases/account/ada_retention.dart';
import 'package:ada/config/billing_dependencies.dart';
import 'package:ada/data/repositories/billing/billing_repository.dart';
import 'package:ada/data/services/billing/account_billing_service.dart';
import 'package:ada/domain/models/app_flavor.dart';
import 'package:ada/domain/models/billing/billing_models.dart';

Future<void> bootstrapAda(AppEnvironment appEnvironment) async {
  traceStartupStage('begin');
  await runAdaStartup(
    loadMonitoringPolicy: loadSentryRuntimePolicy,
    loadRuntimeConfig: loadRuntimePublicConfig,
    monitor: const SentryStartupMonitor(),
    onStartupFailure: showWebBootstrapFailure,
    startApplication: (runtimeConfig) =>
        _startAda(appEnvironment, runtimeConfig),
  );
}

/// Publishes the flavor this process runs as.
///
/// Off the web the entry point decides: each `main_*.dart` names exactly one
/// [AppEnvironment] and [validateEnvironment] has already refused a build whose
/// compile-time flavor disagrees with it.
///
/// On the web every environment is served by the same `lib/main.dart`, so the
/// entry point always declares production and the deployed `config.js` is
/// authoritative instead. The loader has already read that configuration and
/// published the same flavor; deriving it here again keeps bootstrap the single
/// place that guarantees the value is set before any layer is constructed.
void publishAppFlavor({
  required AppEnvironment appEnvironment,
  required RuntimePublicConfig config,
  bool isWeb = kIsWeb,
}) {
  setAppFlavor(
    isWeb
        ? appFlavorForRuntimeEnvironment(config.environment)
        : appEnvironment.flavor,
  );
}

Future<void> _startAda(
  AppEnvironment appEnvironment,
  RuntimePublicConfig runtimeConfig,
) async {
  validateEnvironment(appEnvironment: appEnvironment, config: runtimeConfig);
  // Publish the flavor before anything else is constructed so every layer
  // built below reads the same identity.
  publishAppFlavor(appEnvironment: appEnvironment, config: runtimeConfig);
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  final nativeLinkCoordinator = createNativeLinkCoordinator();
  try {
    updateWebBootstrapStage('session');
    final nativeAccountStartup = await prepareNativeAccountStartup(
      links: nativeLinkCoordinator,
      initializeAccount: () =>
          initializeAdaAccountIfConfigured(runtimeConfig),
    );
    updateWebBootstrapStage('app');
    await _runAda(
      _adaOverrides(
        runtimeConfig: runtimeConfig,
        nativeAccountStartup: nativeAccountStartup,
        nativeLinkCoordinator: nativeLinkCoordinator,
      ),
    );
  } on Object {
    await nativeLinkCoordinator.dispose();
    rethrow;
  }
}

Future<void> _runAda(List<Override> overrides) async {
  void recordFirstFrame() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      traceStartupStage('first-frame');
    });
  }

  Widget scope(Widget child) => ProviderScope(
    overrides: [
      ...overrides,
      ...pomoOverrides,
      if (desktopDistractionsAvailable)
        focusRepositoryProvider.overrideWith(
          (ref) => ref.watch(liveFocusRepositoryProvider),
        ),
    ],
    child: AppIconRuntime(child: PomoRuntime(child: child)),
  );

  if (_supportsDesktopMultiView) {
    await runMultiApp(
      home: (context, id) {
        traceStartupStage('window-attached');
        recordFirstFrame();
        return const AdaApp();
      },
      globalScope: scope,
      config: MultiAppConfig(
        globalWindowOptions: const WindowOptions(
          titleBarStyle: TitleBarStyle.normal,
          windowButtonVisibility: true,
        ),
        macosParams: const MacosPlatformParams(
          closeAppAfterLastWindowClosed: false,
          saveLastWindowToReopen: true,
        ),
        observers: [globalQuickAddWindowManager],
      ),
    );
  } else {
    recordFirstFrame();
    runApp(scope(const AdaApp()));
  }
  WidgetsBinding.instance.addPostFrameCallback((_) {
    hideWebBootstrapLoader();
  });
}

List<Override> _adaOverrides({
  required RuntimePublicConfig runtimeConfig,
  required NativeAccountStartup<AccountClient?> nativeAccountStartup,
  required NativeLinkCoordinator nativeLinkCoordinator,
}) {
  return [
    runtimePublicConfigProvider.overrideWithValue(runtimeConfig),
    accountBootstrapInitializerProvider.overrideWithValue(
      nativeAccountStartup.initializeAccount,
    ),
    nativeLinkCoordinatorProvider.overrideWithValue(nativeLinkCoordinator),
    projectCollaborationOverride,
    ..._billingEntitlementOverrides(runtimeConfig: runtimeConfig),
    ..._billingPurchaseOverrides(),
  ];
}

List<Override> _billingEntitlementOverrides({
  required RuntimePublicConfig runtimeConfig,
}) {
  return [
    billingActiveAccountEntitlementProvider.overrideWith((ref) {
      final entitlement = activeAdaPaidEntitlement(
        ref.watch(accountOverviewProvider).value,
      );
      return entitlement == null
          ? null
          : BillingEntitlement(
              appId: entitlement.appId,
              entitlementId: entitlement.entitlementId,
              status: entitlement.status,
              purchaseType: entitlement.purchaseType,
              source: entitlement.source,
              productId: entitlement.productId,
              store: entitlement.store,
              validUntil: entitlement.validUntil,
              renewsAt: entitlement.renewsAt,
            );
    }),
    billingAccountEntitlementProvider.overrideWith((ref) {
      return hasActiveAdaPaidEntitlement(
        ref.watch(accountOverviewProvider).value,
      );
    }),
    billingEnvironmentEntitlementProvider.overrideWithValue(
      runtimeConfig.selfHostedFeaturesUnlocked,
    ),
    billingSignedInProvider.overrideWith((ref) => _accountSignedIn(ref)),
    billingAccountRefreshTokenProvider.overrideWith((ref) {
      return ref.watch(accountOverviewProvider).value?.generatedAt;
    }),
    billingAccountIdentityProvider.overrideWith((ref) {
      final account = ref.watch(accountClientProvider);
      ref.watch(accountAuthStateProvider);
      return (account, account?.currentUserId);
    }),
    billingAppAccountTokenLoaderProvider.overrideWith((ref) {
      final account = ref.watch(accountClientProvider);
      return () async {
        if (account?.currentUserId == null) {
          return null;
        }
        return account!.getAppleAppAccountToken();
      };
    }),
    billingEntitlementRefresherProvider.overrideWith((ref) {
      return () async {
        ref.invalidate(accountOverviewProvider);
        final overview = await ref.read(accountOverviewProvider.future);
        return hasActiveAdaPaidEntitlement(overview);
      };
    }),
  ];
}

List<Override> _billingPurchaseOverrides() {
  return [
    billingPurchaseLinkerProvider.overrideWith(_purchaseLinker),
    billingOfferRequestProvider.overrideWith(_offerRequest),
    billingStripeGatewayProvider.overrideWith(_stripeGateway),
    billingSignInPromptProvider.overrideWith(_signInPrompt),
  ];
}

bool _accountSignedIn(Ref ref) {
  final account = ref.watch(accountClientProvider);
  final authState = ref.watch(accountAuthStateProvider).value;
  return (authState?.signedIn ?? false) || account?.currentUserId != null;
}

BillingPurchaseLinker? _purchaseLinker(Ref ref) {
  return _accountBillingService(ref)?.linkPurchases;
}

BillingOfferRequest? _offerRequest(Ref ref) {
  return _accountBillingService(ref)?.requestOffer;
}

BillingStripeGateway? _stripeGateway(Ref ref) {
  final service = _accountBillingService(ref);
  if (service == null) return null;
  return BillingStripeGateway(
    loadCatalog: service.loadStripeCatalog,
    createCheckout: service.createStripeCheckout,
    openCheckout: service.openCheckout,
  );
}

AccountBillingService? _accountBillingService(Ref ref) {
  final account = ref.watch(accountClientProvider);
  if (account == null || !_accountSignedIn(ref)) return null;
  return AccountBillingService(
    account: account,
    locale: () =>
        resolveAppLocale(ref.read(appLanguageProvider)).toLanguageTag(),
    onLinked: () {
      if (ref.mounted) ref.invalidate(accountOverviewProvider);
    },
  );
}

BillingSignInPrompt? _signInPrompt(Ref ref) => null;

bool get _supportsDesktopMultiView =>
    !kIsWeb &&
    const {
      TargetPlatform.macOS,
      TargetPlatform.windows,
      TargetPlatform.linux,
    }.contains(defaultTargetPlatform);
