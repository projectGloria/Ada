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
- **Commit Format:** Write one plain sentence stating what changed and why; do not use `feat:`/`fix:`/`chore:` prefixes.
- **Commit & Push Policy:** Never run `git commit`, `git tag`, or `git push` unless explicitly asked; never force-push to `main`. When asked to "commit and push", verify the build and tests pass, commit on `main`, and push to `origin main`. Pushing never releases anything.
- **Releases:** Releases happen only through `/monjita-github-release`, which bumps the version, pushes, runs `gh workflow run release.yml`, and watches it until the GitHub Release is live. Never create release tags or releases by hand.
- **Path Privacy:** Use `C:\Users\you` in documentation, comments, and examples, never the local machine's real username.
- **Release Workflow:** `.github/workflows/release.yml` must be a copy of `GloriaSetup/templates/release.yml`. Don't hand-write release workflows or pin `gloria-setup`; see `.brain/github-actions.md`.
- **Window Chrome:** Disable native OS titlebars; build an integrated frameless titlebar with drag region, double-click maximize, and custom min/max/close controls.
- **Desktop Shell Lock:** Lock the app shell to `100vw x 100vh` (`overflow: hidden`) with internal scroll panes and `user-select: none` on UI chrome.
- **Scrollbars:** Ban raw OS scrollbars; use thin (4–6px) themed scrollbars with transparent tracks and zero layout shift.
- **Interactive Controls:** Custom-style all form controls; define explicit `hover`, `active`, `focus-visible`, and `disabled` states with 120–180ms transitions.
- **Git Branching:** Never create new branches or git worktrees. Work directly on `main` until explicitly told otherwise.
- **Versioning:** Never bump versions during normal work. The user picks the version at release time and `/monjita-github-release` sets it in every version file at once; keep version files in sync with each other otherwise.

## Playbooks (Read Before Task)
- **Building & Packaging:** Read `.brain/building-the-project.md` before packaging, compiling release binaries, or building an installer.
- **GitHub Actions & Releases:** Read `.brain/github-actions.md` before creating/modifying `.github/workflows/*.yml`, setting up release automation, or debugging a failed release.

## Repo Guardrails & Gotchas
- **Workspace Isolation:** `--demo` uses `demo.sqlite3`, while normal runs use `ada.sqlite3`. Set `ADA_LOCAL_DATA_DIR` to use a separate data directory for manual checks.
- **Focus Credit:** Each session has one tag. Reports and town progression use the same credited intervals. Split reports at local day boundaries and cap countdown credit at the target.
- **Desktop Capabilities:** Keep custom window controls aligned with the permissions in `src-tauri/capabilities/main.json`.
- **Product Plan:** Use `INITIAL_PLAN.md` for milestone scope and the Windows interaction checks.

## Done Criteria
- Run `npm run build` for frontend changes and `cargo test --manifest-path src-tauri/Cargo.toml` for Rust, schema, or timer-accounting changes.
- For UI changes, verify Today → Focus → Town → session detail in the desktop app with both a fresh workspace and demo data. Check compact and maximized layouts, keyboard navigation, and Windows scaling at 100% and 150%.
- When bumping versions, compare the three manifests and both lockfiles before reporting completion.

<!-- brain-sync: 31e69a675214 -->
