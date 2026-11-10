import 'package:uuid/uuid.dart';

import 'package:ada/data/services/local/database/app_database.dart';

const adaSyncStateId = 'ada';

Future<String> adaDeviceId(AppDatabase db, {Uuid? uuid}) async {
  final existing = await (db.select(
    db.syncState,
  )..where((row) => row.id.equals(adaSyncStateId))).getSingleOrNull();
  if (existing != null) {
    return existing.deviceId;
  }
  final now = DateTime.now().toUtc();
  final deviceId = (uuid ?? const Uuid()).v4();
  await db
      .into(db.syncState)
      .insert(
        SyncStateCompanion.insert(
          id: adaSyncStateId,
          deviceId: deviceId,
          createdAt: now,
          updatedAt: now,
        ),
      );
  return deviceId;
}
