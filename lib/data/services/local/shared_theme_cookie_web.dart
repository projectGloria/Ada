import 'package:web/web.dart' as web;

const _validThemePreferences = {'light', 'dark', 'system'};

String readSharedThemeCookieHeader() => web.document.cookie;

void writeSharedThemePreference(String value) {
  if (!_validThemePreferences.contains(value)) return;

  final hostname = web.window.location.hostname;
  if (hostname != 'ada.com' && !hostname.endsWith('.ada.com')) {
    return;
  }

  web.document.cookie =
      'ada-theme=$value; Domain=ada.com; Path=/; '
      'Max-Age=31536000; SameSite=Lax; Secure';
}
