import 'package:ada/domain/models/account/account_overview.dart';

const adaFreeTaskHistoryRetention = Duration(days: 365);

bool hasActiveAdaPaidEntitlement(
  AdaAccountOverview? overview, {
  DateTime? now,
  bool hasLocalPaidEntitlement = false,
}) => hasLocalPaidEntitlement || (overview?.profile.isPro ?? false);

AdaAccountEntitlement? activeAdaPaidEntitlement(
  AdaAccountOverview? overview, {
  DateTime? now,
}) {
  final utcNow = (now ?? DateTime.now()).toUtc();
  for (final entitlement
      in overview?.entitlements ?? const <AdaAccountEntitlement>[]) {
    if (entitlement.appId != adaAccountAppId ||
        !entitlement.active ||
        !entitlement.paid) {
      continue;
    }
    final validUntil = entitlement.validUntil;
    if (validUntil == null || validUntil.toUtc().isAfter(utcNow)) {
      return entitlement;
    }
  }
  return null;
}

DateTime? adaTaskHistoryCutoff(
  AdaAccountOverview? overview, {
  DateTime? now,
  DateTime? graceEndsAt,
  bool historyUnlimited = false,
  bool hasLocalPaidEntitlement = false,
}) {
  final utcNow = (now ?? DateTime.now()).toUtc();
  if (historyUnlimited || (graceEndsAt?.toUtc().isAfter(utcNow) ?? false)) {
    return null;
  }
  if (hasActiveAdaPaidEntitlement(
    overview,
    hasLocalPaidEntitlement: hasLocalPaidEntitlement,
  )) {
    return null;
  }
  return utcNow.subtract(adaFreeTaskHistoryRetention);
}
