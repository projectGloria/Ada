const adaAccountAppId = 'ada';

final class AdaAccountProfile {
  const AdaAccountProfile({
    required this.id,
    this.email,
    this.displayName,
    this.avatarEmoji,
    this.isPro = false,
  });

  final String id;
  final String? email;
  final String? displayName;
  final String? avatarEmoji;
  final bool isPro;
}

final class AdaAccountEntitlement {
  const AdaAccountEntitlement({
    required this.appId,
    required this.entitlementId,
    required this.status,
    required this.purchaseType,
    required this.source,
    this.productId,
    this.store,
    this.validUntil,
    this.renewsAt,
  });

  final String appId;
  final String entitlementId;
  final String status;
  final String purchaseType;
  final String source;
  final String? productId;
  final String? store;
  final DateTime? validUntil;
  final DateTime? renewsAt;

  bool get active => status == 'active';
  bool get paid => purchaseType == 'subscription' || purchaseType == 'lifetime';
}

final class AdaAccountAppSummary {
  AdaAccountAppSummary({
    required this.id,
    required this.displayName,
    List<AdaAccountEntitlement> entitlements = const [],
  }) : entitlements = List.unmodifiable(entitlements);

  final String id;
  final String displayName;
  final List<AdaAccountEntitlement> entitlements;
}

final class AdaAccountOverview {
  AdaAccountOverview({
    required this.profile,
    required List<AdaAccountAppSummary> apps,
    required this.generatedAt,
  }) : apps = List.unmodifiable(apps);

  factory AdaAccountOverview.empty(String userId) => AdaAccountOverview(
    profile: AdaAccountProfile(id: userId),
    apps: const [],
    generatedAt: DateTime.now().toUtc(),
  );

  final AdaAccountProfile profile;
  final List<AdaAccountAppSummary> apps;
  final DateTime generatedAt;

  Iterable<AdaAccountEntitlement> get entitlements =>
      apps.expand((app) => app.entitlements);
}
