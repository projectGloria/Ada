import 'package:ada/utils/result.dart';

const appThemeModePreferenceKey = 'app.themeMode';

/// Persisted System / Light / Dark selection as its plain storage value.
abstract interface class ThemeModeRepository {
  Future<Result<String?>> read();
  Future<Result<void>> write(String storageValue);
}
