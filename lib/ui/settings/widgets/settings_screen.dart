import 'package:ada/ui/distractions/widgets/distraction_settings.dart';
import 'package:ada/ui/pomo/widgets/pomo_settings.dart';
import 'package:ada/ui/pomo/view_models/pomo_controller.dart'
    show pomoSupported;
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart'
    show LucideIcons, ShadButton, ShadSwitch, ShadSelect, ShadOption;

import 'package:ada/domain/models/settings/app_language.dart';
import 'package:ada/ui/core/localization/app_l10n.dart';
import 'package:ada/ui/core/widgets/compact_shell_layout.dart';
import 'package:ada/ui/core/themes/app_motion.dart';
import 'package:ada/ui/core/themes/app_theme.dart';
import 'package:ada/domain/models/focus/focus_view_mode.dart';
import 'package:ada/ui/google_calendar/widgets/google_calendar_settings_screen.dart';
import 'package:ada/ui/settings/widgets/settings_components.dart';
import 'package:ada/ui/settings/widgets/settings_navigation.dart';
import 'package:ada/ui/collaboration/widgets/collaboration_inbox_dialog.dart';
import 'package:ada/ui/settings/widgets/app_info_card.dart';
import 'package:ada/ui/settings/widgets/csv_task_import_card.dart';
import 'package:ada/ui/settings/widgets/csv_task_export_row.dart';
import 'package:ada/ui/settings/widgets/theme_settings_card.dart';
import 'package:ada/ui/settings/widgets/app_icon_settings.dart';
import 'package:ada/ui/settings/widgets/status_item_style_settings.dart';
import 'package:ada/ui/settings/widgets/bottom_navigation_settings.dart';
import 'package:ada/ui/settings/widgets/voice_transcription_settings_card.dart';
import 'package:ada/ui/settings/widgets/connected_agents_section.dart';
import 'package:ada/ui/settings/view_models/connected_agents_view_model.dart';
import 'package:ada/ui/settings/view_models/settings_view_model.dart';
import 'package:ada/ui/settings/widgets/task_list_settings.dart';
import 'package:ada/ui/settings/widgets/date_format_settings.dart';
import 'package:ada/ui/settings/widgets/focus_sound_settings.dart';
import 'package:ada/ui/settings/widgets/local_profile_settings.dart';
import 'package:ada/ui/settings/widgets/ambient_sound_settings.dart';
import 'package:ada/ui/settings/widgets/obsidian_sync_card.dart';
import 'package:ada/ui/onboarding/view_models/learning_tour_view_model.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({this.location, this.signOutOverride, super.key});

  final Uri? location;
  final Future<void> Function()? signOutOverride;

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen>
    with SingleTickerProviderStateMixin {
  late final _navigation = SettingsNavigation(
    widget.location ?? Uri(path: '/settings'),
  );
  final _visited = <SettingsSection>{};
  late final _fade = AnimationController(vsync: this, value: 1);

  @override
  void initState() {
    super.initState();
    // The controller owns the first request; later visits refresh quietly.
    if (!ref.read(connectedAgentsViewModelProvider).isLoading) {
      unawaited(
        Future<void>.microtask(() {
          if (mounted) {
            return ref
                .read(connectedAgentsViewModelProvider.notifier)
                .refresh();
          }
        }),
      );
    }
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final previous = _navigation.selected;
    _navigation.syncLocation(widget.location ?? Uri(path: '/settings'));
    if (_navigation.selected != previous) {
      FocusManager.instance.primaryFocus?.unfocus();
      _fade.duration = AppMotion.duration(context, AppMotion.state);
      _fade.forward(from: 0);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) _fade.value = 1;
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  String _title(SettingsSection section) {
    final l10n = context.l10n;
    return switch (section) {
      SettingsSection.general => l10n.settingsSectionGeneral,
      SettingsSection.appearance => l10n.settingsSectionAppearance,
      SettingsSection.tasksFocus => l10n.settingsSectionTasksFocus,
      SettingsSection.pomo => l10n.settingsSectionPomo,
      SettingsSection.integrations => l10n.settingsSectionIntegrations,
      SettingsSection.about => l10n.settingsAboutTitle,
    };
  }

  Widget _icon(SettingsSection section) => switch (section) {
    SettingsSection.general => const Icon(
      LucideIcons.slidersHorizontal,
      size: 18,
    ),
    SettingsSection.appearance => const Icon(LucideIcons.palette, size: 18),
    SettingsSection.tasksFocus => const Icon(LucideIcons.timer, size: 18),
    SettingsSection.pomo => const _PomoIcon(),
    SettingsSection.integrations => const Icon(LucideIcons.plug, size: 18),
    SettingsSection.about => const Icon(LucideIcons.info, size: 18),
  };

  Widget _menu({required bool wide}) => ListView(
    padding: EdgeInsets.zero,
    children: [
      for (final section in _navigation.sections)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Semantics(
            selected: wide && _navigation.selected == section,
            child: ShadButton.ghost(
              height: 48,
              mainAxisAlignment: MainAxisAlignment.start,
              backgroundColor: wide && _navigation.selected == section
                  ? context.appColors.accent.withValues(alpha: 0.10)
                  : null,
              foregroundColor: wide && _navigation.selected == section
                  ? context.appColors.accent
                  : context.appColors.primaryText,
              onPressed: () => context.go(settingsLocation(section).toString()),
              child: Expanded(
                child: Row(
                  children: [
                    _icon(section),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(_title(section), textAlign: TextAlign.start),
                    ),
                    if (!wide) const Icon(LucideIcons.chevronRight, size: 16),
                  ],
                ),
              ),
            ),
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) => SettingsSurface(
    child: LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 960;
        _navigation.resolveLayout(wide: wide, pomoAvailable: pomoSupported);
        final selected = _navigation.selected;
        final showTitle = !CompactShellHeading.isShown(context);
        final showBack = !wide && selected != null;
        if (selected != null) _visited.add(selected);
        return PopScope(
          canPop: wide || selected == null,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && !wide && selected != null) {
              context.go(settingsLocation(null).toString());
            }
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (showTitle || showBack) ...[
                Row(
                  children: [
                    if (showBack)
                      IconButton(
                        tooltip: MaterialLocalizations.of(
                          context,
                        ).backButtonTooltip,
                        onPressed: () =>
                            context.go(settingsLocation(null).toString()),
                        icon: const Icon(LucideIcons.arrowLeft),
                      ),
                    if (showBack && showTitle) const SizedBox(width: 8),
                    if (showTitle)
                      Expanded(
                        child: Text(
                          context.l10n.settingsTitle,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 24),
              ],
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Offstage(
                      offstage: !wide,
                      child: ExcludeFocus(
                        excluding: !wide,
                        child: SizedBox(width: 216, child: _menu(wide: true)),
                      ),
                    ),
                    SizedBox(width: wide ? 32 : 0),
                    Expanded(
                      child: FadeTransition(
                        opacity: _fade.drive(
                          CurveTween(curve: AppMotion.curve),
                        ),
                        child: IndexedStack(
                          index: _navigation.contentIndex,
                          children: [
                            ExcludeFocus(
                              excluding: selected != null,
                              child: _menu(wide: false),
                            ),
                            for (final section in _navigation.sections)
                              TickerMode(
                                key: ValueKey(section),
                                enabled: selected == section,
                                child: ExcludeFocus(
                                  excluding: selected != section,
                                  child: _visited.contains(section)
                                      ? ListView(
                                          key: PageStorageKey(
                                            'settings-${section.name}',
                                          ),
                                          padding: EdgeInsets.zero,
                                          children: [
                                            Text(
                                              _title(section),
                                              style: Theme.of(
                                                context,
                                              ).textTheme.titleLarge,
                                            ),
                                            const SizedBox(height: 12),
                                            Consumer(
                                              builder: (context, ref, _) =>
                                                  _content(section, ref),
                                            ),
                                            const SizedBox(height: 24),
                                          ],
                                        )
                                      : const SizedBox.shrink(),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    ),
  );

  Widget _content(SettingsSection section, WidgetRef ref) {
    final l10n = context.l10n;
    final settings = ref.watch(settingsViewModelProvider);
    final viewModel = ref.read(settingsViewModelProvider.notifier);
    switch (section) {
      case SettingsSection.general:
        final language = settings.language;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const LocalProfileSettingsCard(),
            const SizedBox(height: 24),
            SettingsGroup(
              children: [
            SettingsRow(
              title: l10n.settingsLanguageTitle,
              subtitle: l10n.settingsLanguageSubtitle,
              control: ShadSelect<AppLanguage>(
                key: ValueKey(language),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 14,
                ),
                initialValue: language,
                options: [
                  for (final item in AppLanguage.values)
                    ShadOption(
                      value: item,
                      child: Text(
                        item == AppLanguage.system
                            ? l10n.settingsLanguageSystem
                            : item.nativeName,
                      ),
                    ),
                ],
                selectedOptionBuilder: (context, item) => Text(
                  item == AppLanguage.system
                      ? l10n.settingsLanguageSystem
                      : item.nativeName,
                ),
                onChanged: (value) {
                  if (value != null) {
                    saveSetting(context, viewModel.setLanguage(value));
                  }
                },
              ),
            ),
            const DateFormatSettings(),
            if (settings.voiceModeSupported)
              const VoiceTranscriptionSettingsCard(),
            SettingsRow(
              title: l10n.settingsReturnRemindersTitle,
              subtitle: l10n.settingsReturnRemindersSubtitle,
              onTap: () => saveSetting(
                context,
                viewModel.setReengagement(!settings.reengagementEnabled),
              ),
              controlWidth: 48,
              control: ShadSwitch(
                key: const Key('settings-reengagement-notifications-switch'),
                value: settings.reengagementEnabled,
                onChanged: (value) =>
                    saveSetting(context, viewModel.setReengagement(value)),
              ),
            ),
            ListTile(
              key: const Key('settings-shortcuts-button'),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              leading: const Icon(LucideIcons.keyboard, size: 20),
              title: Text(l10n.settingsShortcutsTitle),
              subtitle: Text(l10n.settingsShortcutsSubtitle),
              trailing: const Icon(LucideIcons.chevronRight, size: 18),
              onTap: () => context.push('/settings/shortcuts'),
            ),
            ListTile(
              key: const Key('settings-learning-tour-button'),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              leading: const Icon(LucideIcons.compass, size: 20),
              title: Text(l10n.learningTourSettings),
              trailing: const Icon(LucideIcons.chevronRight, size: 18),
              onTap: () {
                ref.read(learningTourProvider.notifier).replay();
                context.go('/today');
              },
            ),
          ],
        ),
      ],
    );
      case SettingsSection.appearance:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ThemeSettingsCard(),
            if (statusItemStyleSupported) ...[
              const SizedBox(height: 24),
              const StatusItemStyleSettings(),
            ],
            const SizedBox(height: 24),
            const AppIconSettings(),
            const SizedBox(height: 24),
            const BottomNavigationSettings(),
            const SizedBox(height: 24),
            const TaskListStyleSettings(),
          ],
        );
      case SettingsSection.tasksFocus:
        final style = settings.timerStyle;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const DefaultTimedBlockDurationSettings(),
            const SizedBox(height: 24),
            SettingsGroup(
              children: [
                SettingsRow(
                  title: l10n.settingsTimerVisualTitle,
                  subtitle: l10n.settingsTimerVisualSubtitle,
                  control: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final option in FocusTimerVisualStyle.values)
                        ChoiceChip(
                          label: Text(
                            option == FocusTimerVisualStyle.bar
                                ? l10n.settingsTimerVisualBar
                                : l10n.settingsTimerVisualCircle,
                          ),
                          selected: option == style,
                          onSelected: (_) => saveSetting(
                            context,
                            viewModel.setTimerStyle(option),
                          ),
                        ),
                    ],
                  ),
                ),
                SettingsRow(
                  title: l10n.settingsFocusCompletionCelebrationTitle,
                  subtitle: l10n.settingsFocusCompletionCelebrationSubtitle,
                  onTap: () => saveSetting(
                    context,
                    viewModel.setCelebration(!settings.celebrationEnabled),
                  ),
                  controlWidth: 48,
                  control: ShadSwitch(
                    key: const Key(
                      'settings-focus-completion-celebration-switch',
                    ),
                    value: settings.celebrationEnabled,
                    onChanged: (value) =>
                        saveSetting(context, viewModel.setCelebration(value)),
                  ),
                ),
                const DistractionSettings(),
                FocusSoundSettings(
                  active: _navigation.selected == SettingsSection.tasksFocus,
                ),
              ],
            ),
            const SizedBox(height: 24),
            const AmbientSoundSettingsCard(),
          ],
        );
      case SettingsSection.pomo:
        return const PomoSettings();
      case SettingsSection.integrations:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!kIsWeb) ...[
              const GoogleCalendarSettingsScreen(embedded: true),
              const SizedBox(height: 24),
            ],
            const ObsidianSyncCard(),
            const SizedBox(height: 24),
            if (settings.accountConfigured && settings.signedIn) ...[
              ConnectedAgentsSection(key: ValueKey(settings.userId)),
              const SizedBox(height: 24),
              SettingsRow(
                title: l10n.collaborationInboxTitle,
                subtitle: l10n.collaborationInboxSubtitle,
                onTap: () => showCollaborationInboxDialog(context),
                control: const Icon(LucideIcons.chevronRight, size: 18),
              ),
              const SizedBox(height: 24),
            ],
            if (isCsvTaskImportSupported()) ...[
              const CsvTaskImportCard(),
              const SizedBox(height: 24),
              const CsvTaskExportRow(),
            ],
          ],
        );
      case SettingsSection.about:
        return const SettingsAppInfoCard(key: Key('settings-app-info-section'));
    }
  }

}

class _PomoIcon extends StatelessWidget {
  const _PomoIcon();

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: const Size.square(18),
    painter: _PomoIconPainter(
      IconTheme.of(context).color ?? context.appColors.primaryText,
    ),
  );
}

class _PomoIconPainter extends CustomPainter {
  const _PomoIconPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path()
      ..moveTo(7, 7)
      ..cubicTo(3, 6, 2, 10, 2, 13)
      ..cubicTo(2, 18, 6, 22, 12, 21)
      ..cubicTo(18, 22, 22, 18, 22, 13)
      ..cubicTo(22, 10, 21, 6, 17, 7)
      ..moveTo(12, 7)
      ..lineTo(8, 5)
      ..lineTo(9, 8)
      ..lineTo(5, 10)
      ..lineTo(10, 10)
      ..lineTo(12, 12)
      ..lineTo(14, 10)
      ..lineTo(19, 10)
      ..lineTo(15, 8)
      ..lineTo(16, 5)
      ..close()
      ..moveTo(12, 7)
      ..quadraticBezierTo(11, 3, 14, 2);
    canvas.save();
    canvas.scale(size.width / 24, size.height / 24);
    canvas.drawPath(path, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _PomoIconPainter oldDelegate) =>
      color != oldDelegate.color;
}
