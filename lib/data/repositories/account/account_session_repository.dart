import 'package:ada/domain/models/account/account_overview.dart';
import 'package:ada/domain/models/account/account_session.dart';
import 'package:ada/utils/result.dart';

abstract interface class AccountSessionRepository {
  AccountSession get currentSession;
  Stream<AccountSession> watchSession();
  Stream<AdaAccountProfile?> watchProfile();
  Future<Result<void>> refresh();
}
