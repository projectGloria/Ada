import 'package:ada/ui/distractions/widgets/blocking_screen.dart';
import 'package:ada/ui/distractions/view_models/distraction_view_model.dart';
import 'package:ada/data/services/platform/native_link_coordinator_core.dart'
    show appleWidgetRoute;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:ada/domain/models/app_flavor.dart';
import 'package:ada/ui/billing/widgets/purchase_success_screen.dart';
import 'package:ada/ui/collaboration/widgets/collaboration_join_screen.dart';
import 'package:ada/ui/collaboration/widgets/public_project_screen.dart';
import 'package:ada/ui/focus/widgets/focus_screen.dart';
import 'package:ada/ui/google_calendar/widgets/google_calendar_settings_screen.dart';
import 'package:ada/ui/onboarding/widgets/onboarding_gate.dart';
import 'package:ada/ui/planning/widgets/today_screen.dart';
import 'package:ada/ui/productivity/widgets/reports_screen.dart';
import 'package:ada/ui/productivity/widgets/achievements_screen.dart';
import 'package:ada/ui/settings/widgets/settings_screen.dart';
import 'package:ada/ui/settings/widgets/settings_navigation.dart';
import 'package:ada/ui/settings/widgets/keyboard_shortcuts_screen.dart';
import 'package:ada/ui/settings/widgets/telegram_account_link_screen.dart';
import 'package:ada/ui/settings/widgets/oauth_consent_screen.dart';
import 'package:ada/ui/tasks/widgets/browse_screen.dart';
import 'package:ada/ui/tasks/widgets/calendar_screen.dart';
import 'package:ada/ui/tasks/widgets/inbox_screen.dart';
import 'package:ada/ui/tasks/widgets/kanban_screen.dart';
import 'package:ada/ui/tasks/widgets/priority_matrix_screen.dart';
import 'package:ada/ui/tasks/widgets/project_screen.dart';
import 'package:ada/ui/tasks/widgets/label_screen.dart';
import 'package:ada/ui/tasks/widgets/projects_screen.dart';
import 'package:ada/ui/tasks/widgets/search_screen.dart';
import 'package:ada/ui/tasks/widgets/task_detail_screen.dart';
import 'package:ada/ui/tasks/widgets/timeline_screen.dart';
import 'package:ada/ui/tasks/widgets/upcoming_screen.dart';
import 'package:ada/ui/habits/widgets/habits_screen.dart';
import 'package:ada/config/account_providers.dart';
import 'package:ada/ui/core/widgets/app_startup_gate.dart';
import 'package:ada/config/runtime_public_config.dart';
import 'package:ada/routing/task_detail_navigation.dart';
import 'package:ada/routing/project_map_navigation.dart';
import 'package:ada/routing/route_date.dart';
import 'package:ada/ui/core/widgets/adaptive_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final nativeLinkCoordinator = ref.read(nativeLinkCoordinatorProvider);
  final router = GoRouter(
    initialLocation: initialAppLocationFor(isWeb: kIsWeb, baseUri: Uri.base),
    overridePlatformDefaultLocation: true,
    onEnter: (context, current, next, router) async {
      if (current.uri != next.uri) {
        final guard = ref.read(taskDetailSaveGuardProvider);
        if (guard.hasRegisteredEditors && !await guard.saveAll()) {
          return const Block.stop();
        }
      }
      return const Allow();
    },
    redirect: (_, state) {
      if (_isFocusDeepLink(state.uri)) {
        return '/focus';
      }
      final widgetRoute = appleWidgetRoute(state.uri);
      if (widgetRoute != null) return widgetRoute;
      return null;
    },
    routes: [
      GoRoute(path: '/', redirect: (_, _) => '/today'),
      GoRoute(path: '/login', redirect: (_, _) => '/today'),
      GoRoute(path: '/register', redirect: (_, _) => '/today'),
      GoRoute(path: '/reset-password', redirect: (_, _) => '/today'),
      GoRoute(path: '/auth/challenge', redirect: (_, _) => '/today'),
      GoRoute(
        path: '/oauth/consent',
        pageBuilder: (context, state) => NoTransitionPage(
          key: ValueKey(state.uri.toString()),
          child: _OAuthConsentRoute(uri: state.uri),
        ),
      ),
      GoRoute(
        path: '/purchase-success',
        pageBuilder: (context, state) => NoTransitionPage(
          child: PurchaseSuccessScreen(
            returnTo: _purchaseSuccessReturnTo(
              state.uri.queryParameters['returnTo'],
            ),
            source: state.uri.queryParameters['source'],
          ),
        ),
      ),
      GoRoute(
        path: '/telegram-account-link',
        pageBuilder: (context, state) => NoTransitionPage(
          child: TelegramAccountLinkScreen(
            token: state.uri.queryParameters['token'] ?? '',
            botName:
                ref.read(runtimePublicConfigProvider).environment ==
                    RuntimeEnvironment.production
                ? 'ada_bot'
                : 'ada_test_bot',
          ),
        ),
      ),
      GoRoute(
        path: '/shared/join/:token',
        pageBuilder: (context, state) => NoTransitionPage(
          child: CollaborationJoinScreen(
            token: state.pathParameters['token'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: '/shared/public/:token',
        pageBuilder: (context, state) => NoTransitionPage(
          child: PublicProjectScreen(
            token: state.pathParameters['token'] ?? '',
          ),
        ),
      ),
      ShellRoute(
        builder: (context, state, child) {
          return AppStartupGate(
            shellBuilder: (content, dataReady) => OnboardingGate(
              enabled: dataReady,
              child: AdaptiveShell(
                dataReady: dataReady,
                location: state.uri.path,
                taskId: state.uri.queryParameters['task'],
                habitId:
                    state.uri.path == '/habits' &&
                        state.uri.queryParameters['task'] == null
                    ? state.uri.queryParameters['habit']
                    : null,
                mapFullscreen: isProjectMapFullscreen(state.uri),
                child: content,
              ),
            ),
            child: child,
          );
        },
        routes: [
          GoRoute(
            path: '/search',
            pageBuilder: (context, state) => NoTransitionPage(
              child: SearchScreen(
                initialQuery: state.uri.queryParameters['q'] ?? '',
              ),
            ),
          ),
          GoRoute(
            path: '/today',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: TodayScreen()),
          ),
          GoRoute(
            path: '/habits',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: HabitsScreen()),
          ),
          GoRoute(
            path: '/upcoming',
            pageBuilder: (context, state) => NoTransitionPage(
              child: UpcomingScreen(
                selectedDate: parseRouteDate(state.uri.queryParameters['date']),
              ),
            ),
          ),
          GoRoute(
            path: '/inbox',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: InboxScreen()),
          ),
          GoRoute(
            path: '/priority-matrix',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: PriorityMatrixScreen()),
          ),
          GoRoute(
            path: '/calendar',
            pageBuilder: (context, state) => NoTransitionPage(
              child: CalendarScreen(
                selectedDate: parseRouteDate(state.uri.queryParameters['date']),
              ),
            ),
          ),
          GoRoute(
            path: '/timeline',
            pageBuilder: (context, state) => NoTransitionPage(
              child: TimelineScreen(
                selectedDate: parseRouteDate(state.uri.queryParameters['date']),
              ),
            ),
          ),
          GoRoute(
            path: '/kanban',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: KanbanScreen(showMobileTitle: false),
            ),
          ),
          GoRoute(
            path: '/blocking',
            redirect: (context, state) =>
                ref.read(blockingAvailableProvider) ? null : '/focus',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: BlockingScreen()),
          ),
          GoRoute(
            path: '/focus',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: FocusScreen()),
          ),
          GoRoute(
            path: '/browse',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: BrowseScreen()),
          ),
          GoRoute(
            path: '/browse/overdue',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: OverdueTasksScreen()),
          ),
          GoRoute(
            path: '/browse/completed',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: CompletedTasksScreen()),
          ),
          GoRoute(
            path: '/projects',
            pageBuilder: (context, state) => NoTransitionPage(
              child: ProjectsScreen(
                showLabels: state.uri.queryParameters['tab'] == 'labels',
              ),
            ),
          ),
          GoRoute(
            path: '/reports',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: ReportsScreen()),
          ),
          GoRoute(
            path: '/reports/achievements',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: AchievementsScreen()),
          ),
          GoRoute(
            path: '/settings',
            pageBuilder: (context, state) => NoTransitionPage(
              key: state.pageKey,
              child: SettingsScreen(location: state.uri),
            ),
          ),
          GoRoute(
            path: '/settings/shortcuts',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: KeyboardShortcutsScreen()),
          ),
          GoRoute(
            path: '/integrations/outlook-calendar',
            redirect: (_, _) =>
                settingsLocation(SettingsSection.integrations).toString(),
          ),
          GoRoute(
            path: '/integrations/google-calendar',
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: GoogleCalendarSettingsScreen()),
          ),
          GoRoute(
            path: '/label/:id',
            pageBuilder: (context, state) => NoTransitionPage(
              child: LabelScreen(labelId: state.pathParameters['id']!),
            ),
          ),
          GoRoute(
            path: '/project/:id',
            pageBuilder: (context, state) => NoTransitionPage(
              child: ProjectScreen(projectId: state.pathParameters['id']!),
            ),
          ),
          GoRoute(
            path: '/task/:id',
            pageBuilder: (context, state) => NoTransitionPage(
              child: TaskDetailScreen(
                key: ValueKey(state.pathParameters['id']),
                taskId: state.pathParameters['id']!,
              ),
            ),
          ),
        ],
      ),
    ],
  );
  ref.listen(accountSessionProvider, (_, _) => router.refresh());
  final detachNativeRoutes = nativeLinkCoordinator?.attachRouteSink((location) {
    router.go(location);
    debugPrint('ADA_NATIVE_LINK_HANDLED');
  });
  ref.onDispose(() {
    detachNativeRoutes?.call();
    router.dispose();
  });
  return router;
});

class _OAuthConsentRoute extends ConsumerWidget {
  const _OAuthConsentRoute({required this.uri});

  final Uri uri;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(accountSessionProvider).value;
    return OAuthConsentScreen(
      key: ValueKey((uri.toString(), session?.userId, session?.generation)),
      uri: uri,
    );
  }
}

String initialAppLocationFor({required bool isWeb, required Uri baseUri}) {
  if (!isWeb || !baseUri.path.startsWith('/')) {
    return '/today';
  }
  if (baseUri.path == '/login' ||
      baseUri.path == '/register' ||
      baseUri.path == '/login-callback' ||
      baseUri.path == '/reset-password' ||
      baseUri.path == '/auth/challenge') {
    return '/today';
  }
  return Uri(
    path: baseUri.path.isEmpty ? '/' : baseUri.path,
    query: baseUri.hasQuery ? baseUri.query : null,
  ).toString();
}

String _purchaseSuccessReturnTo(String? value) {
  return _localReturnPath(
    value,
    fallback: '/today',
    blockedPath: '/purchase-success',
  );
}

String _localReturnPath(
  String? value, {
  required String fallback,
  required String blockedPath,
}) {
  if (value == null || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  final uri = Uri.tryParse(value);
  if (uri == null ||
      uri.hasScheme ||
      uri.host.isNotEmpty ||
      uri.path == blockedPath) {
    return fallback;
  }
  return uri.toString();
}

bool _isFocusDeepLink(Uri uri) {
  return uri.scheme == appFlavor.urlScheme && uri.host == 'focus';
}

String? webAppRedirectFor({
  required bool isWeb,
  required bool signedIn,
  required Uri uri,
}) => null;
