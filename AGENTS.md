# AGENTS.md — Ada

Ada is an offline Windows focus tracker and task planner that grows a town from credited focus time. It uses Tauri 2, React, TypeScript, Rust, and SQLite.

## Commands
- Install frontend dependencies: `npm ci`
- Run the desktop app: `npm run desktop -- dev`
- Run with a seeded sample week: `npm run demo`
- Typecheck and build the frontend: `npm run build`
- Test the Rust store: `cargo test --manifest-path src-tauri/Cargo.toml`
- Test countdown expiry: `cargo test --manifest-path src-tauri/Cargo.toml expiry_credits_the_target_once_even_when_the_checkpoint_is_late`
- Build the Windows executable: `npm run desktop -- build --no-bundle`

## Architecture
- `src/main.tsx` renders the React shell, task views, timer, town, and reports. `src/styles.css` owns the responsive layout and themes.
- `src/workspace.ts` defines the typed `Action` and `Snapshot` used by the Rust `workspace` command.
- `src-tauri/src/main.rs` opens and locks the workspace database, registers the Tauri command, and checkpoints the timer in a background thread.
- `src-tauri/src/store.rs` owns SQLite transactions, timer recovery, and credited intervals. `src-tauri/src/schema.sql` defines the tables, the single-active-session constraint, and progression thresholds.
- `src/town-art.tsx` renders the isometric town on Canvas and supplies the lot hit testing.
- **Version Manifests:** Keep `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` in sync. Update the root package entries in `package-lock.json` and `src-tauri/Cargo.lock` with them.

## Personal Rules (Brain)
- **Commit Format:** Write one plain sentence stating what changed and why. Omit conventional-commit prefixes.
- **Commit & Push Policy:** Commit, tag, or push only when explicitly asked. Never force-push to `main`. For a requested commit and push, verify the build and tests and verify the version bump and alignment for runtime or packaging changes. Commit on `main` and push to `origin main`. Use the release workflow for release tags once configured.
- **Path Privacy:** Use `C:\Users\you` for Windows user paths in documentation, comments, and examples.
- **Release Workflow Check:** Before pushing to `main`, verify the release workflow against `.brain/github-actions.md`. If missing or misconfigured, bring it into line in the same push and report the change.
- **Window Chrome:** Use an integrated frameless title bar with dragging, double-click maximize, and custom minimize, maximize, and close controls.
- **Desktop Shell Lock:** Keep the shell at `100vw × 100vh` with shell overflow hidden, internal scroll panes, and `user-select: none` on UI chrome.
- **Scrollbars:** Use themed 4–6 px scrollbars with transparent tracks and no layout shift.
- **Interactive Controls:** Style form controls with explicit hover, active, keyboard-focus, and disabled states and 120–180 ms transitions.
- **Git Branching:** Work directly on `main`. Create branches or worktrees only when explicitly directed.
- **Versioning (Minimal Changes):** Bump an existing alpha number once per uncommitted runtime or packaging change set. Compare with `HEAD` before bumping. Skip docs-only and read-only work.
- **Versioning (Major/Minor Changes):** Ask for the exact target version before changing major or minor versions or dropping the alpha suffix.

## Playbooks (Read Before Task)
- **Building & Packaging:** Read `.brain/building-the-project.md` before packaging, compiling release binaries, or building an installer.
- **GitHub Actions & Releases:** Read `.brain/github-actions.md` before editing GitHub Actions workflows, setting up release automation, or preparing a first release push.

## Repo Guardrails & Gotchas
- **Workspace Isolation:** `--demo` uses `demo.sqlite3`, while normal runs use `ada.sqlite3`. Set `ADA_LOCAL_DATA_DIR` to use a separate data directory for manual checks.
- **Focus Credit:** Each session has one tag. Reports and town progression use the same credited intervals. Split reports at local day boundaries and cap countdown credit at the target.
- **Desktop Capabilities:** Keep custom window controls aligned with the permissions in `src-tauri/capabilities/main.json`.
- **Product Plan:** Use `INITIAL_PLAN.md` for milestone scope and the Windows interaction checks.

## Done Criteria
- Run `npm run build` for frontend changes and `cargo test --manifest-path src-tauri/Cargo.toml` for Rust, schema, or timer-accounting changes.
- For UI changes, verify Today → Focus → Town → session detail in the desktop app with both a fresh workspace and demo data. Check compact and maximized layouts, keyboard navigation, and Windows scaling at 100% and 150%.
- When bumping versions, compare the three manifests and both lockfiles before reporting completion.

<!-- brain-sync: d9fdf3731a37 -->
