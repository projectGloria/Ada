# AGENTS.md — Ada

Ada is an offline Windows focus tracker, task planner, and markdown notes app that grows a town from credited focus time. It uses Tauri 2, React 19, TypeScript, CodeMirror 6, Rust, and SQLite.

## Commands
- Install frontend dependencies: `npm ci`
- Run the desktop app: `npm run desktop -- dev`
- Run with a seeded sample week: `npm run demo`
- Typecheck and build the frontend: `npm run build`
- Test the Rust store: `cargo test --manifest-path src-tauri/Cargo.toml`
- Test countdown expiry: `cargo test --manifest-path src-tauri/Cargo.toml expiry_credits_the_target_once_even_when_the_checkpoint_is_late`
- Build the Windows executable: `npm run desktop -- build --no-bundle`
- Enable accounts in a build: set `ADA_SUPABASE_URL` and `ADA_SUPABASE_PUBLISHABLE_KEY` before building (or before `npm run desktop -- dev`). Without them, Sign in and Create account explain that accounts aren't connected.

## Architecture
- `src/main.tsx` renders the React shell, task lists, timer, town, and reports; `src/planner.tsx` renders project and board views; `src/styles.css` owns the responsive layout and themes; `src/cyberspace.tsx` renders the Gloria theme's animated canvas background.
- `src/notes.tsx` and `src/editor/` implement folder-grouped markdown notes (`[[wikilinks]]`, `#tags`, daily notes, search) on CodeMirror 6 with live preview and slash commands. Note bodies stay out of `Snapshot` and load on demand via `note`.
- `src/workspace.ts` defines the typed `Action`, `Snapshot`, and IPC wrappers for the Tauri commands (`workspace`, `account`, `sync_now`, `note`, `search_notes`, `open_url`).
- `src-tauri/src/main.rs` opens and locks the workspace database, registers Tauri commands (restricting `open_url` to `http://`, `https://`, `mailto:`), and runs the timer checkpoint and sync worker threads.
- `src-tauri/src/store.rs` owns SQLite transactions, timer recovery, and credited intervals; `src-tauri/src/store/planner.rs` owns tasks, projects, statuses, and recurrence; `src-tauri/src/store/notes.rs` owns markdown notes, wikilink/tag extraction, and FTS/search.
- **Schema Migrations:** `Store::open` applies `schema.sql` → `planner.sql` → `catalog.sql` → `sync.sql` → `notes.sql` by `PRAGMA user_version` (now 5) and refuses newer databases. Add schema changes as a new SQL step with a version bump; never edit an already-shipped step.
- `src/town-art.tsx` renders the isometric town on Canvas and supplies lot hit testing.
- `src/account.tsx` is the sign-in, registration, verification, recovery, merge, and account management dialog; `src/ui.tsx` holds the shared `Modal` and `IconButton`.
- `src-tauri/src/account.rs` talks to Supabase Auth from Rust (the webview has no network access), keeps the refresh token in Windows Credential Manager, and switches between `ada.sqlite3` and `account-<user id>.sqlite3`. `src-tauri/src/store/merge.rs` moves one workspace's data into another.
- **Sync:** `src-tauri/src/store/sync.rs` syncs tags, projects, tasks, finished sessions, and notes of a signed-in workspace between PCs. Triggers in `sync.sql` and `notes.sql` queue local changes in `sync_dirty`; a round resends `sync_outbox`, pulls by revision with a 3-way field merge against `sync_shadow`, then pushes. Collisions go to `sync_conflicts` for review in Settings. The worker thread in `main.rs` runs at launch, after sign-in, a few seconds after a change, every 60 s, and on Sync now; never in demo or guest workspaces.
- `supabase/migrations/` holds the SQL the owner applies to the shared Supabase project (`delete_own_account`, `sync`, `notes` adding `'note'` to `ada_records` and updating `ada_push`). Confirmation and recovery email templates must include `{{ .Token }}` so people can type the code into Ada.
- **Version Manifests:** Keep `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` in sync. Update the root package entries in `package-lock.json` and `src-tauri/Cargo.lock` with them.

## Personal Rules (Brain)
- **Commit Format:** Write one plain sentence stating what changed and why; do not use `feat:`/`fix:`/`chore:` conventional-commit prefixes.
- **Commit & Push Policy:** Never run `git commit`, `git tag`, or `git push` unless explicitly asked; never force-push to `main`. When the user says "commit and push", verify the build and tests pass, commit on `main`, and push to `origin main`. Pushing never releases anything.
- **Releases:** Releases happen only through `/gloria-github-release`, which bumps the version, pushes, runs `gh workflow run release.yml`, and watches it until the GitHub Release is live. Never create release tags or releases by hand.
- **Path Privacy:** Always use `C:\Users\you` in documentation, comments, and examples—never hardcode the local machine's real username.
- **Release Workflow:** `.github/workflows/release.yml` must be a copy of `GloriaSetup/templates/release.yml` (shared `check`/`release` jobs from `projectGloria/GloriaSetup/.github/workflows/app-{check,release}.yml@main`, plus this repo's own `build` job). Don't hand-write release workflows or pin `gloria-setup`; see `.brain/github-actions.md`.
- **Window Chrome:** Disable native OS titlebars; build an integrated frameless titlebar with drag region, double-click maximize, and custom min/max/close controls.
- **Desktop Shell Lock:** Lock the app shell to `100vw x 100vh` (`overflow: hidden`) with internal scroll panes and `user-select: none` on UI chrome.
- **Scrollbars:** Ban raw OS scrollbars; use thin (4–6px) themed scrollbars with transparent tracks and zero layout shift.
- **Interactive Controls:** Custom-style all form controls; define explicit `hover`, `active`, `focus-visible`, and `disabled` states with snappy 120–180ms transitions.
- **Git Branching:** Never create new branches or git worktrees. Always work directly on `main` until explicitly told otherwise.
- **Versioning:** Never bump versions during normal work. The user picks the version at release time and `/gloria-github-release` sets it in every version file at once; keep version files in sync with each other otherwise.

## Playbooks (Read Before Task)
- **Building & Packaging:** Read `.brain/building-the-project.md` before packaging, compiling release binaries, or building an installer.
- **GitHub Actions & Releases:** Read `.brain/github-actions.md` before creating/modifying `.github/workflows/*.yml`, setting up release automation, or debugging a failed release.

## Repo Guardrails & Gotchas
- **Workspace Isolation:** `--demo` uses `demo.sqlite3`, while normal runs use `ada.sqlite3`, or `account-<user id>.sqlite3` while signed in (recorded in `account.json`). Set `ADA_LOCAL_DATA_DIR` to use a separate data directory for manual checks. Normal runs are single-instance; `--demo` and `ADA_LOCAL_DATA_DIR` runs are not.
- **Accounts:** Signing in, signing out, and deleting an account are refused while a focus session is active, so a running timer never changes workspace. Sync never moves a running session; it appears on other PCs once it ends.
- **Focus Credit:** Each session has one tag. Reports and town progression use the same credited intervals. Split reports at local day boundaries and cap countdown credit at the target.
- **Desktop Capabilities:** Keep custom window controls aligned with the permissions in `src-tauri/capabilities/main.json`.
- **Product Plan:** Use `INITIAL_PLAN.md` for milestone scope and the Windows interaction checks.

## Done Criteria
- Run `npm run build` for frontend changes and `cargo test --manifest-path src-tauri/Cargo.toml` for Rust, schema, or timer-accounting changes.
- For UI changes, verify Today → Focus → Town → Notes → session detail in the desktop app with both a fresh workspace and demo data. Check compact and maximized layouts, keyboard navigation, and Windows scaling at 100% and 150%.
- When bumping versions, compare the three manifests and both lockfiles before reporting completion.

<!-- brain-sync: dbdb119dacdc -->
