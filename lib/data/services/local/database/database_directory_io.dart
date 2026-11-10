import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';

import 'package:ada/data/services/local/flavor_application_support_directory_io.dart';
import 'package:ada/data/services/local/database/app_database.dart'
    show adaDatabaseFileName;
import 'package:ada/domain/models/app_flavor.dart';

Future<Object> adaDatabaseDirectory() async {
  final Directory targetDirectory;
  if (defaultTargetPlatform == TargetPlatform.linux) {
    targetDirectory = await linuxApplicationDataDirectory();
  } else {
    final supportDir = await flavorApplicationSupportDirectory();
    targetDirectory = Directory(path.join(supportDir.path, 'databases'));
  }

  await targetDirectory.create(recursive: true);

  if (defaultTargetPlatform != TargetPlatform.linux) {
    return _migrateLegacyDocumentsDatabase(targetDirectory);
  }

  return targetDirectory;
}

/// Moves a database created by older builds out of the user's Documents
/// folder.
///
/// The copy is made with `VACUUM INTO`, which reads the live database
/// (including anything still in its `-wal` file) as one consistent snapshot
/// and writes a single self-contained file. That file is checked with
/// `PRAGMA integrity_check` and only then renamed into place, so a crash or a
/// full disk mid-copy can never leave a half-written database at the target
/// path. The legacy file is left untouched as a fallback.
///
/// Returns the directory the database should be opened from: the new
/// directory once it holds the data, or the legacy directory when the move
/// failed, so the app keeps working on the user's data instead of creating a
/// new empty database. The move is retried on the next launch.
Future<Directory> _migrateLegacyDocumentsDatabase(
  Directory targetDirectory,
) async {
  final fileName = '$adaDatabaseFileName.sqlite';
  final targetMainFile = File(path.join(targetDirectory.path, fileName));
  if (await targetMainFile.exists()) return targetDirectory;
  final Directory legacyDocsDir;
  final File legacyMainFile;
  try {
    legacyDocsDir = await getApplicationDocumentsDirectory();
    legacyMainFile = File(path.join(legacyDocsDir.path, fileName));
    if (!await legacyMainFile.exists()) return targetDirectory;
  } on Object catch (error, stack) {
    _reportMigrationFailure(error, stack);
    return targetDirectory;
  }

  final staging = File('${targetMainFile.path}.migrating');
  try {
    if (await staging.exists()) await staging.delete();
    final legacy = sqlite3.open(legacyMainFile.path);
    try {
      legacy.execute('VACUUM INTO ?', [staging.path]);
    } finally {
      legacy.close();
    }
    final copy = sqlite3.open(staging.path);
    try {
      final result = copy.select('PRAGMA integrity_check');
      final ok =
          result.length == 1 && result.first.values.first?.toString() == 'ok';
      if (!ok) {
        throw StateError('Migrated database failed integrity_check: $result');
      }
    } finally {
      copy.close();
    }
    // A database must never be opened from the staging path, and the target
    // is still absent here, so rename is atomic on every supported platform.
    await staging.rename(targetMainFile.path);
    return targetDirectory;
  } on Object catch (error, stack) {
    _reportMigrationFailure(error, stack);
    try {
      if (await staging.exists()) await staging.delete();
    } on Object {
      /* Leftover staging files are replaced on the next attempt. */
    }
    return legacyDocsDir;
  }
}

void _reportMigrationFailure(Object error, StackTrace stack) {
  FlutterError.reportError(
    FlutterErrorDetails(
      exception: error,
      stack: stack,
      library: 'ada database',
      context: ErrorDescription('while moving the legacy database'),
    ),
  );
}

@visibleForTesting
Future<Directory> linuxApplicationDataDirectory({
  Map<String, String>? environment,
}) async {
  final resolvedEnvironment = environment ?? Platform.environment;
  final configuredDataHome = resolvedEnvironment['XDG_DATA_HOME'];
  final home = resolvedEnvironment['HOME'];
  final dataHome = configuredDataHome != null && configuredDataHome.isNotEmpty
      ? configuredDataHome
      : home != null && home.isNotEmpty
      ? path.join(home, '.local', 'share')
      : throw StateError('HOME is required to locate Ada data.');
  final directory = Directory(path.join(dataHome, appFlavor.applicationId));
  await directory.create(recursive: true);
  return directory;
}
