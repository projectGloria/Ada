import 'package:flutter/material.dart';

import 'package:ada/domain/models/focus/focus_view_mode.dart';
import 'package:ada/ui/core/themes/app_theme.dart';
import 'package:ada/ui/focus/widgets/focus_rhythm.dart';
import 'package:ada/ui/focus/widgets/focus_rhythm_rail.dart';
import 'package:ada/ui/onboarding/view_models/onboarding_view_model.dart';

/// Decorative slide artwork; the controls below expose the actual settings.
class OnboardingIllustration extends StatelessWidget {
  const OnboardingIllustration({
    required this.step,
    required this.timerStyle,
    this.height = 148,
    super.key,
  });

  final OnboardingStep step;
  final FocusTimerVisualStyle timerStyle;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: MediaQuery.withNoTextScaling(
        child: SizedBox(
          height: height,
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: SizedBox(
                width: 280,
                height: 148,
                child: switch (step) {
                  OnboardingStep.language => const _LanguageArtwork(),
                  OnboardingStep.timer => Center(
                    child: _TimerPreview(style: timerStyle),
                  ),
                  OnboardingStep.tasks ||
                  OnboardingStep.theme => const SizedBox.shrink(),
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A static sample using the same session renderer as Focus, without a live run.
class OnboardingTimerPreview extends StatelessWidget {
  const OnboardingTimerPreview({
    required this.style,
    required this.sessionDisplay,
    super.key,
  });

  final FocusTimerVisualStyle style;
  final FocusSessionDisplay sessionDisplay;

  static final _rhythm = FocusRhythm([
    for (var index = 0; index < 8; index++)
      FocusRhythmStep(
        phase: index.isEven
            ? FocusRhythmPhase.work
            : index == 7
            ? FocusRhythmPhase.longBreak
            : FocusRhythmPhase.shortBreak,
        state: index == 0
            ? FocusRhythmState.running
            : FocusRhythmState.upcoming,
        sequence: index + 1,
        workOrdinal: index ~/ 2 + 1,
        plannedSeconds: index.isEven
            ? 1500
            : index == 7
            ? 900
            : 300,
        source: FocusRhythmSource.projected,
      ),
  ]);

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: IgnorePointer(
      child: MediaQuery.withNoTextScaling(
        child: SizedBox(
          height: 192,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: SizedBox(
              width: 360,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _TimerPreview(style: style),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 48,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: SizedBox(
                        width: 400,
                        child: FocusRhythmRail(
                          rhythm: _rhythm,
                          semanticsLabel: '',
                          compact: true,
                          activeProgress: .75,
                          activeSequence: 1,
                          display: sessionDisplay,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _TimerPreview extends StatelessWidget {
  const _TimerPreview({required this.style});

  final FocusTimerVisualStyle style;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final time = Text(
      '25:00',
      textScaler: TextScaler.noScaling,
      textDirection: TextDirection.ltr,
      style: AppTheme.monoTextStyle.copyWith(
        fontSize: 32,
        fontWeight: FontWeight.w400,
        color: colors.primaryText,
        letterSpacing: -1,
      ),
    );
    return ExcludeSemantics(
      child: SizedBox(
        width: 200,
        height: 136,
        child: style == FocusTimerVisualStyle.circle
            ? Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox.square(
                    dimension: 128,
                    child: CircularProgressIndicator(
                      value: 0.75,
                      strokeWidth: 5,
                      color: colors.accent,
                      backgroundColor: colors.border,
                      strokeCap: StrokeCap.round,
                    ),
                  ),
                  time,
                ],
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  time,
                  const SizedBox(height: 16),
                  LinearProgressIndicator(
                    value: 0.75,
                    minHeight: 5,
                    borderRadius: BorderRadius.circular(4),
                    color: colors.accent,
                    backgroundColor: colors.border,
                  ),
                ],
              ),
      ),
    );
  }
}

class _LanguageArtwork extends StatelessWidget {
  const _LanguageArtwork();

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final glyph = switch (Localizations.localeOf(context).languageCode) {
      'ru' => 'Я',
      'de' => 'Ä',
      'es' => 'Ñ',
      'fr' => 'É',
      'ar' => 'ع',
      'zh' => '文',
      'pt' => 'ã',
      'ja' => 'あ',
      'ko' => '한',
      _ => 'A',
    };
    return Stack(
      alignment: Alignment.center,
      children: [
        Container(
          width: 140,
          height: 140,
          decoration: BoxDecoration(
            color: colors.accentTint,
            shape: BoxShape.circle,
          ),
        ),
        Container(
          width: 116,
          height: 116,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.accentFill,
            shape: BoxShape.circle,
          ),
          child: Text(
            glyph,
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              color: colors.onAccent,
              fontWeight: FontWeight.w400,
            ),
          ),
        ),
        const Positioned(
          left: 20,
          top: 8,
          child: _LanguageChip(text: 'Hello', angle: -0.12),
        ),
        const Positioned(
          right: 10,
          bottom: 12,
          child: _LanguageChip(text: 'Привет', angle: 0.12),
        ),
        const Positioned(
          left: 8,
          bottom: 18,
          child: _LanguageChip(text: 'こんにちは', angle: -0.16),
        ),
      ],
    );
  }
}

class _LanguageChip extends StatelessWidget {
  const _LanguageChip({required this.text, required this.angle});
  final String text;
  final double angle;

  @override
  Widget build(BuildContext context) => Transform.rotate(
    angle: angle,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: context.appColors.surface,
        border: Border.all(color: context.appColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text, style: Theme.of(context).textTheme.bodySmall),
    ),
  );
}
