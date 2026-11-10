import 'dart:convert';
import 'dart:io';
import 'package:file_selector/file_selector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:ada/config/providers.dart';
import 'package:ada/domain/models/tasks/task_models.dart';
import 'package:ada/utils/result.dart';

const _obsidianVaultPathKey = 'obsidian.vault_path';
const _obsidianSyncDailyNotesKey = 'obsidian.sync_daily_notes';

class ObsidianSyncState {
  const ObsidianSyncState({
    this.vaultPath,
    this.syncDailyNotes = true,
    this.isSyncing = false,
    this.lastSyncTime,
    this.syncMessage,
  });

  final String? vaultPath;
  final bool syncDailyNotes;
  final bool isSyncing;
  final DateTime? lastSyncTime;
  final String? syncMessage;

  ObsidianSyncState copyWith({
    String? vaultPath,
    bool? syncDailyNotes,
    bool? isSyncing,
    DateTime? lastSyncTime,
    String? syncMessage,
  }) => ObsidianSyncState(
    vaultPath: vaultPath ?? this.vaultPath,
    syncDailyNotes: syncDailyNotes ?? this.syncDailyNotes,
    isSyncing: isSyncing ?? this.isSyncing,
    lastSyncTime: lastSyncTime ?? this.lastSyncTime,
    syncMessage: syncMessage ?? this.syncMessage,
  );
}

final obsidianSyncControllerProvider =
    NotifierProvider<ObsidianSyncController, ObsidianSyncState>(
      ObsidianSyncController.new,
    );

class ObsidianSyncController extends Notifier<ObsidianSyncState> {
  SharedPreferences? _prefs;

  @override
  ObsidianSyncState build() {
    _initPrefs();
    return const ObsidianSyncState();
  }

  Future<void> _initPrefs() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      final vault = _prefs?.getString(_obsidianVaultPathKey);
      final daily = _prefs?.getBool(_obsidianSyncDailyNotesKey) ?? true;
      state = state.copyWith(vaultPath: vault, syncDailyNotes: daily);
    } catch (_) {}
  }

  Future<void> setVaultPath(String? path) async {
    state = state.copyWith(vaultPath: path);
    if (path == null) {
      await _prefs?.remove(_obsidianVaultPathKey);
    } else {
      await _prefs?.setString(_obsidianVaultPathKey, path);
    }
  }

  Future<void> setSyncDailyNotes(bool value) async {
    state = state.copyWith(syncDailyNotes: value);
    await _prefs?.setBool(_obsidianSyncDailyNotesKey, value);
  }

  /// Select Obsidian Vault folder
  Future<String?> pickVaultFolder() async {
    try {
      final selectedDirectory = await getDirectoryPath();
      if (selectedDirectory != null) {
        await setVaultPath(selectedDirectory);
        return selectedDirectory;
      }
    } catch (_) {}
    return null;
  }

  /// Export tasks directly to a Markdown file chosen by the user
  Future<Result<bool>> exportMarkdownFile() async {
    return Result.capture(() async {
      final tasks = await ref
          .read(taskRepositoryProvider)
          .watchTasks(const TaskQuery.all())
          .first;
      final projects =
          await ref.read(projectRepositoryProvider).watchProjects().first;
      final markdown = generateObsidianMarkdown(
        tasks: tasks,
        projects: projects,
      );

      final dateStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final saveLocation = await getSaveLocation(
        suggestedName: 'Ada Tasks $dateStr.md',
        acceptedTypeGroups: const [
          XTypeGroup(
            label: 'Markdown',
            extensions: ['md', 'markdown'],
            mimeTypes: ['text/markdown', 'text/plain'],
          ),
        ],
      );

      final path = saveLocation?.path;
      if (path == null) return false;

      final file = File(path);
      await file.writeAsString(markdown, encoding: utf8);
      return true;
    });
  }

  /// Sync to configured Obsidian Vault directory
  Future<Result<String>> syncToVault() async {
    final vault = state.vaultPath;
    if (vault == null || vault.isEmpty) {
      return Failure('No Obsidian vault path configured', StackTrace.current);
    }

    state = state.copyWith(isSyncing: true, syncMessage: null);
    try {
      final dir = Directory(vault);
      if (!await dir.exists()) {
        return Failure(
          'Configured vault directory does not exist',
          StackTrace.current,
        );
      }

      final tasks = await ref
          .read(taskRepositoryProvider)
          .watchTasks(const TaskQuery.all())
          .first;
      final projects =
          await ref.read(projectRepositoryProvider).watchProjects().first;
      final markdown = generateObsidianMarkdown(
        tasks: tasks,
        projects: projects,
      );

      // 1. Write main tasks note
      final mainNote = File('$vault/Ada Tasks.md');
      await mainNote.writeAsString(markdown, encoding: utf8);

      // 2. Write daily note if enabled
      if (state.syncDailyNotes) {
        final now = DateTime.now();
        final dateKey = DateFormat('yyyy-MM-dd').format(now);
        final dailyTasks = tasks.where((t) {
          if (t.isDeleted) return false;
          if (t.dueJson != null && t.dueJson!.contains(dateKey)) return true;
          if (t.completedAt != null) {
            final compStr = DateFormat('yyyy-MM-dd').format(t.completedAt!);
            return compStr == dateKey;
          }
          return false;
        }).toList();

        final dailyNoteContent = StringBuffer()
          ..writeln('# \u{1F345} Focus & Tasks \u2014 $dateKey\n')
          ..writeln(
            '> Auto-synced from Ada on ${DateFormat.jms().format(now)}\n',
          );

        if (dailyTasks.isEmpty) {
          dailyNoteContent.writeln('_No tasks scheduled for today._\n');
        } else {
          for (final task in dailyTasks) {
            dailyNoteContent.writeln(_formatTaskLine(task));
          }
        }

        final dailyNotesDir = Directory('$vault/Daily Notes');
        if (!await dailyNotesDir.exists()) {
          await dailyNotesDir.create(recursive: true);
        }
        final dailyFile = File('${dailyNotesDir.path}/$dateKey.md');
        await dailyFile.writeAsString(
          dailyNoteContent.toString(),
          encoding: utf8,
        );
      }

      state = state.copyWith(
        isSyncing: false,
        lastSyncTime: DateTime.now(),
        syncMessage: 'Synced successfully to Obsidian!',
      );
      return const Success('Synced successfully');
    } catch (e, st) {
      state = state.copyWith(isSyncing: false, syncMessage: 'Sync failed: $e');
      return Failure(e, st);
    }
  }

  /// Import markdown tasks into Ada inbox
  Future<Result<int>> importMarkdownFile() async {
    return Result.capture(() async {
      final file = await openFile(
        acceptedTypeGroups: const [
          XTypeGroup(
            label: 'Markdown',
            extensions: ['md', 'markdown', 'txt'],
          ),
        ],
      );
      if (file == null) return 0;

      final content = await file.readAsString();
      final repository = ref.read(taskRepositoryProvider);
      final createdTasks = parseMarkdownChecklists(content);

      for (final input in createdTasks) {
        await repository.createTask(input);
      }

      return createdTasks.length;
    });
  }
}

String generateObsidianMarkdown({
  required List<TaskItem> tasks,
  required List<ProjectItem> projects,
}) {
  final now = DateTime.now();
  final dateStr = DateFormat('yyyy-MM-dd').format(now);
  final projectNames = {for (final p in projects) p.id: p.name};

  final activeTasks = tasks.where((t) => !t.isDeleted && !t.isCompleted).toList();
  final completedTasks = tasks.where((t) => !t.isDeleted && t.isCompleted).toList();

  final todayTasks = activeTasks.where((t) {
    if (t.dueJson == null) return false;
    return t.dueJson!.contains(dateStr);
  }).toList();

  final todayIds = todayTasks.map((t) => t.id).toSet();
  final otherActive = activeTasks.where((t) => !todayIds.contains(t.id)).toList();

  final buffer = StringBuffer()
    ..writeln('# \u{1F3AF} Ada Tasks')
    ..writeln('> Updated: ${DateFormat.yMMMd().add_jms().format(now)}\n')
    ..writeln('## \u{1F4C5} Today (${todayTasks.length})');

  if (todayTasks.isEmpty) {
    buffer.writeln('_No tasks due today._\n');
  } else {
    for (final task in todayTasks) {
      buffer.writeln(
        _formatTaskLine(task, projectName: projectNames[task.projectId]),
      );
    }
    buffer.writeln();
  }

  buffer.writeln('## \u{1F4E5} Active Tasks (${otherActive.length})');
  if (otherActive.isEmpty) {
    buffer.writeln('_No other pending tasks._\n');
  } else {
    for (final task in otherActive) {
      buffer.writeln(
        _formatTaskLine(task, projectName: projectNames[task.projectId]),
      );
    }
    buffer.writeln();
  }

  if (completedTasks.isNotEmpty) {
    buffer.writeln(
      '## \u{2705} Recently Completed (${completedTasks.take(15).length})',
    );
    for (final task in completedTasks.take(15)) {
      buffer.writeln(
        _formatTaskLine(task, projectName: projectNames[task.projectId]),
      );
    }
    buffer.writeln();
  }

  return buffer.toString();
}

String _formatTaskLine(TaskItem task, {String? projectName}) {
  final check = task.isCompleted ? '- [x]' : '- [ ]';
  final pieces = <String>[check, task.content];

  if (projectName != null && projectName.isNotEmpty && projectName != 'Inbox') {
    pieces.add('#${projectName.replaceAll(RegExp(r'\s+'), '_')}');
  }

  if (task.priority > 1) {
    pieces.add('\u{1F53A}P${task.priority}');
  }

  if ((task.estimatedFocusIntervals ?? 0) > 0) {
    pieces.add('\u{23F3}${task.estimatedFocusIntervals}x25m');
  }

  if (task.dueJson != null && task.dueJson!.isNotEmpty) {
    try {
      final parsed = jsonDecode(task.dueJson!) as Map<String, dynamic>;
      final date = parsed['date'] ?? parsed['datetime'];
      if (date != null) {
        pieces.add('\u{1F4C5}$date');
      }
    } catch (_) {}
  }

  final line = pieces.join(' ');
  final desc = task.description?.trim();
  if (desc != null && desc.isNotEmpty) {
    return '$line\n  > ${desc.replaceAll('\n', '\n  > ')}';
  }
  return line;
}

List<CreateTaskInput> parseMarkdownChecklists(String content) {
  final lines = content.split('\n');
  final result = <CreateTaskInput>[];
  final taskRegex = RegExp(r'^\s*-\s*\[([ xX])\]\s*(.+)$');

  for (final line in lines) {
    final match = taskRegex.firstMatch(line);
    if (match != null) {
      final text = match.group(2)!.trim();
      if (text.isNotEmpty) {
        result.add(CreateTaskInput(content: text));
      }
    }
  }

  return result;
}
