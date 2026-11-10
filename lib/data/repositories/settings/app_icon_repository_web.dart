import 'dart:js_interop';

import 'package:ada/data/repositories/settings/app_icon_repository.dart';
import 'package:ada/domain/models/app_flavor.dart';
import 'package:ada/domain/models/settings/app_icon_choice.dart';

@JS('adaSetAppIcon')
external void _setIcon(JSString icon, JSString flavor, JSString mode);

class PlatformAppIconRepository implements AppIconRepository {
  AppIconChoice _current = AppIconChoice.pomo;

  @override
  Future<AppIconChoice> read() async => _current;

  @override
  Future<void> apply(AppIconChoice choice) async {
    _setIcon(choice.id.toJS, appFlavor.name.toJS, appIconBuildMode.toJS);
    _current = choice;
  }
}
