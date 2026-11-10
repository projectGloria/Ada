import 'package:url_launcher/url_launcher.dart';

const adaPrivacyPolicyUrl = 'https://ada.com/privacy/';
const adaTermsOfUseUrl =
    'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const adaSupportUrl = 'mailto:support@ada.com';
const appleAccountUrl = 'https://account.apple.com/';

Future<bool> launchAdaExternalUrl(String url) {
  return launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
}
