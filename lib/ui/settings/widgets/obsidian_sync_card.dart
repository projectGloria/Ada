import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart'
    show LucideIcons, ShadButton, ShadSwitch;

import 'package:ada/data/services/markdown/markdown_sync_service.dart';
import 'package:ada/ui/settings/widgets/settings_components.dart';
import 'package:ada/utils/result.dart';

class ObsidianSyncCard extends ConsumerWidget {
  const ObsidianSyncCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(obsidianSyncControllerProvider);
    final controller = ref.read(obsidianSyncControllerProvider.notifier);

    return SettingsGroup(
      children: [
        SettingsRow(
          title: 'Obsidian Vault',
          subtitle: state.vaultPath ?? 'No vault folder selected',
          control: ShadButton.outline(
            height: 40,
            onPressed: () async {
              final path = await controller.pickVaultFolder();
              if (path != null && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Obsidian Vault connected: $path')),
                );
              }
            },
            leading: const Icon(LucideIcons.folderOpen, size: 16),
            child: Text(state.vaultPath == null ? 'Select Vault' : 'Change'),
          ),
        ),
        if (state.vaultPath != null) ...[
          SettingsRow(
            title: 'Generate Daily Notes',
            subtitle: 'Creates / updates notes in vault/Daily Notes/YYYY-MM-DD.md',
            control: ShadSwitch(
              value: state.syncDailyNotes,
              onChanged: controller.setSyncDailyNotes,
            ),
          ),
          SettingsRow(
            title: 'Sync to Vault',
            subtitle: state.syncMessage ??
                (state.lastSyncTime != null
                    ? 'Last synced: ${state.lastSyncTime!.hour}:${state.lastSyncTime!.minute.toString().padLeft(2, '0')}'
                    : 'Writes Ada Tasks.md to your vault'),
            control: ShadButton(
              height: 40,
              enabled: !state.isSyncing,
              leading: state.isSyncing
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(LucideIcons.refreshCw, size: 16),
              onPressed: () async {
                final result = await controller.syncToVault();
                if (!context.mounted) return;
                final text = switch (result) {
                  Success() => 'Obsidian vault updated successfully!',
                  Failure(error: final err) => 'Sync error: $err',
                };
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(text)),
                );
              },
              child: const Text('Sync Now'),
            ),
          ),
        ],
        SettingsRow(
          title: 'Import & Export Markdown',
          subtitle: 'Direct file export and markdown checklist importer',
          control: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ShadButton.outline(
                height: 40,
                leading: const Icon(LucideIcons.fileDown, size: 16),
                onPressed: () async {
                  final res = await controller.exportMarkdownFile();
                  if (!context.mounted) return;
                  if (res is Success<bool> && res.value) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Markdown tasks exported successfully!'),
                      ),
                    );
                  }
                },
                child: const Text('Export .md'),
              ),
              ShadButton.outline(
                height: 40,
                leading: const Icon(LucideIcons.fileUp, size: 16),
                onPressed: () async {
                  final res = await controller.importMarkdownFile();
                  if (!context.mounted) return;
                  if (res is Success<int>) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Imported ${res.value} tasks from markdown!'),
                      ),
                    );
                  }
                },
                child: const Text('Import .md'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
