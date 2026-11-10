import 'package:ada/ui/core/localization/app_localizations.dart';
import 'package:ada/domain/models/tasks/task_models.dart';

extension ProjectLocalizations on ProjectItem {
  String displayName(AppLocalizations l10n) =>
      id == inboxProjectId && name == 'Inbox' ? l10n.navInbox : name;
}
