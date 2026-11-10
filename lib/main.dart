import 'package:ada/config/app_environment.dart';
import 'package:ada/config/bootstrap.dart';

Future<void> main() => bootstrapAda(AppEnvironment.production);
