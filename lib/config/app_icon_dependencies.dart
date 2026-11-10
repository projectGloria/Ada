import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/data/repositories/settings/app_icon_repository.dart';
import 'package:ada/data/repositories/settings/app_icon_repository_native.dart'
    if (dart.library.js_interop) 'package:ada/data/repositories/settings/app_icon_repository_web.dart';

final appIconRepositoryProvider = Provider<AppIconRepository>(
  (ref) => PlatformAppIconRepository(),
);
