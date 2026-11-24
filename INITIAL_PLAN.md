# Build Ada — a Windows focus tracker that grows a little town

## 1. Product vision and design standard

Build Ada from scratch with **Tauri 2, React, TypeScript, Rust, and SQLite**. Ada should answer **“Where did my time go?”** and give me somewhere I genuinely look forward to returning. Reports tell me how I spent my time. A persistent, cozy isometric town lets me see what those hours built.

> **UI and UX are among my highest priorities. I want Ada to be my go-to app: the first thing I open when I sit down to work and a place I enjoy returning to. I expect strong visual design, careful interaction design, and a recognizable personality. Make it feel cozy, thoughtful, and alive. Put as much care into the ordinary task list, timer, and settings as you put into the town.**

Design for three everyday moments:

- **When I arrive, I feel oriented.** I can see what matters today, find my current task, and start focusing without remembering where a control lives. The screen has a clear reading order and one obvious primary action.
- **While I work, Ada feels calm.** The time is easy to read at a glance. Timer digits stay aligned as they change. Pause and Finish stay in place. The construction scene can sit quietly in my peripheral vision, and I can hide it whenever I want.
- **When I return, the place feels familiar.** My Reading district is where I left it. A building has a new roof or another lit window. Clicking it takes me back to the sessions behind that change. Even ten minutes of work has a visible place here.

**Set the visual direction before multiplying screens.** Build an interactive, data-backed first slice covering **Today → start a session → Focus → finish → Town → session detail**. Review it at the actual Windows window sizes, with both an empty account and a realistic week of activity. Use this slice to settle typography, spacing, density, artwork, motion, and interaction states before rolling the design across the full sidebar. Visual and interaction quality are release criteria.

## 2. Visual language and desktop experience

- **Typography:** Bundle **Montserrat** locally with its license. Establish a restrained hierarchy for page titles, section headings, task names, metadata, and timer numerals. Check long task names, narrow layouts, and Windows display scaling using the actual font. [Montserrat](https://fonts.google.com/specimen/Montserrat)
- **Color:** Default to **warm dark**. Use deep warm-charcoal surfaces, Pampas `#F4F3EE` for primary text, Cloudy `#B1ADA1` for quieter information, and Crail `#C15F3C` for primary actions and selected accents. Use White `#FFFFFF` and Pampas as foundations for the light theme. Derive accessible foreground and interaction colors from that palette. Offer Dark, Light, and Follow Windows. [Requested Claude palette](https://mobbin.com/colors/brand/claude)
- **Composition:** Take the screenshot’s compact sidebar, grouped destinations, recognizable icons, and prominent **Add task** action as the reference. Give each main view a layout suited to its job. Today should read like a working list, Focus should give the timer room to breathe, Reports should make comparisons easy, and Town should give the artwork the largest uninterrupted surface.
- **Coziness:** Put warmth into the details people revisit: amber light from a library window, a familiar street corner, a quiet change when a session ends. Keep task entry fast and reports legible. Omit mascots and the “Enable Ada” button.
- **Interaction:** Give every control clear hover, pressed, keyboard-focus, and disabled states. Use short, consistent transitions. Preserve scroll position, selection, and keyboard focus when returning from a task or report detail. Empty screens should offer a useful first action. Errors should explain what happened and whether the user’s work was saved.
- **Windows shell:** Use an integrated frameless title bar with dragging, double-click maximize, and accessible window controls. Keep content panes independently scrollable with thin themed scrollbars. Support compact and maximized windows, keyboard navigation, reduced motion, and Windows scaling. In a narrow sidebar, collapse intentionally to an icon rail with tooltips so labels like **Settings** never appear half-cut.

## 3. First launch, tasks, and focus sessions

Ada works immediately offline. On first launch, let the user choose a startup destination, with **Today** preselected and **Focus**, **Town**, and **Reports** available. Keep this preference in Settings. Surface an active session regardless of the startup destination. The profile control and Settings must both provide reachable **Sign in** and **Create account** actions.

There are two paths into the same timer:

1. **Focus first.** Open Focus, select or create **exactly one tag**, choose a countdown or free stopwatch, and start.
2. **Task first.** Create a to-do and press Play from any task view. Carry its task and project into the timer chooser. A to-do may have multiple organizational tags. Each individual focus session records **one**. Preselect a sole tag, remember the last choice for a multi-tag task, and allow tag creation for an untagged task.

Offer 15-, 25-, and 50-minute presets, a custom countdown, and a stopwatch. Remember the last timer choice. While running, show the activity, tag, time, Pause/Resume, and Finish. A compact timer follows the user through the app. Starting another session offers to return to or finish the current one.

Credit actual focused time. Finishing a 45-minute countdown after 12 minutes records 12 minutes. Pauses earn zero. A countdown ends at its target and can issue one desktop notification. Offer **Mark task complete** separately so a task can span multiple sessions.

Persist timer transitions immediately. Minimizing keeps the timer running. After sleep, exit, or a crash, show the uncertain interval and let the user **Count this time** or **Exclude this time**. Cap countdown credit at the target. Only timers create tracked time. Users can inspect sessions, correct a tag or task association, or delete an accidental session with confirmation.

## 4. The town and the planner

**One session → one tag → one district.** Thirty minutes of Reading contributes thirty minutes to overall time, the Reading report, and construction in the Reading district. Each screen uses the same credited intervals.

| Town behavior | Specification |
|---|---|
| **Founding** | A tag’s first session starts its construction site. Give arbitrary tag names a neutral starter building and let the user choose an architectural style later. Starting a timer requires no building-management decisions. |
| **Progression** | Show construction progress during the first session. Initial tuning adds a visible detail after 5 cumulative minutes, completes a starter building at 60 minutes, and adds its first expansion at 3 hours. Keep thresholds in a versioned progression table so they can be tuned after seeing the experience in use. |
| **Continuity** | Give districts stable positions. Grow them with adjoining buildings, paths, gardens, and street details. Time away leaves the town intact. Renaming or archiving a tag preserves its district and history. |
| **Visibility** | Default to **Focus and Town**, with a small construction scene during focus and the full map in Town. Settings also offers **Town page only**. Reduced motion uses static construction stages. Bundle the artwork for offline use. |
| **Exploration** | Support pan, zoom, fit-to-town, and keyboard district selection. Selecting a district reveals its tag, total time, recent sessions, and next milestone. A session opens directly from that list. |
| **Accuracy** | Derive growth from credited time. Retried sync operations cannot build twice. Correcting a session’s tag transfers its credited time to the appropriate district. |

Build the full sidebar around these destinations:

| Destination | Working experience |
|---|---|
| **Profile, Search, Add task** | Access account and sync status, search local tasks/projects/tags, and capture a title-only task to Inbox from anywhere. |
| **Inbox, Today, Upcoming** | Capture unscheduled work, see today’s and overdue tasks, and browse future work by date. Today includes tracked time and a direct Start Focus action. |
| **Focus and Town** | Start or resume a timer, repeat a recent activity, and visit the districts that work has built. |
| **Habits** | Define daily or selected-weekday habits, record check-ins, and see streaks. Check-ins record completion. Timed sessions contribute minutes. |
| **Calendar and Timeline** | Calendar shows planned tasks and supports rescheduling. Timeline shows what actually happened, including sessions, tags, tasks, and pauses. |
| **Kanban and Priority Matrix** | Move tasks through To do, In progress, and Done. Organize those same tasks by importance and urgency. Edits appear consistently across views. |
| **Projects and Browse** | Create and archive projects, review project time, and explore tags, completed tasks, and overdue work. |
| **Code** | Optionally connect GitHub and see commits and pull requests alongside sessions. GitHub activity provides context for recorded work. |
| **Reports** | Show total time, daily trends, and breakdowns by session tag, project, and task. Support Today, Week, Month, custom ranges, and previous-period comparisons. Every total opens the sessions behind it. |
| **Settings** | Manage accounts, sync, startup destination, timer defaults, theme, town visibility, notifications, reporting time zone, and GitHub. |

Tasks support a title, notes, organizational tags, an optional project, due date, subtasks, recurrence, importance, urgency, and board status. Completing a recurring task creates its next occurrence exactly once. Capture a session’s chosen tag and project at start. Later task edits preserve the historical record.

Include standalone Focus sessions in overall and tag reports. Split credited intervals across reporting-day boundaries in the selected time zone, including midnight and daylight-saving transitions.

## 5. Offline storage, accounts, and handoff

- **Local-first architecture:** Rust owns SQLite transactions, timer state, recovery, and sync. React uses typed Tauri commands. Store local changes and their pending sync operations in the same transaction. Fonts, town artwork, tasks, history, and reports remain available offline.
- **Shared Supabase Free project:** The owner provisions one backend for all Ada users. Implement email/password registration, verification, sign-in, recovery, sign-out, and deletion. Isolate workspaces with per-user row-level security. On first sign-in, offer **Merge into my account** or **Keep separate** for existing guest data. Show counts before merging.
- **Sync:** Batch writes, deduplicate operation IDs, pull by server-issued revisions, and retain deletion markers. Preserve independent field edits and surface conflicting edits for review. Sync session facts, styles, and stable district placements. Timer ticks and town animations run locally.
- **Live handoff:** A second online PC can take over a running or paused session with **Continue on this PC**. Transfer ownership atomically while preserving the session, tag, elapsed time, and town credit. Reject delayed controls from a previous owner.
- **Offline overlaps:** Preserve sessions independently recorded on disconnected PCs. Show disputed time separately and ask which activity receives overlapping minutes. Resolution credits each interval once in Reports and Town.
- **Configuration:** The owner supplies the Supabase project URL and publishable key. Apply versioned database migrations through the deployment environment and configure an email sender before opening registration to the public. GitHub uses optional desktop device flow with credentials stored on the Windows device. [Supabase email setup](https://supabase.com/docs/guides/auth/auth-smtp) · [GitHub device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

## 6. Milestones and release gates

1. **Prove the feeling and the loop.** Deliver the offline Today → Focus → Town slice first. Show it with a fresh account and a week of believable activity. Review the actual app at 100% and 150% Windows scaling, in compact and maximized windows, with pointer and keyboard. Verify that a new user can find Start Focus, understand what is growing, and return tomorrow to see what was saved.
2. **Complete the personal planner.** Create a recurring multi-tag task with a subtask and project, start it from Today, and choose one focus tag. Verify that one district grows, recurrence fires once, and Calendar, Kanban, Matrix, Search, and Projects agree.
3. **Connect real accounts.** Verify registration and recovery through visible UI. Test two-account isolation, guest merge, sign-out, reconnection, deletion, and retries. Confirm that a second PC reconstructs the same town.
4. **Prove timing and reporting.** Test countdown expiry, early finish, sleep, crashes, midnight, daylight-saving changes, simultaneous takeover, stale controls, and offline overlap. Reconcile each report and district against its underlying sessions.
5. **Polish the full release.** Finish town progression, habits, GitHub activity, both themes, reduced motion, keyboard access, and every sidebar destination. Review empty, populated, loading, offline, and error states in the installed app. Package for Windows with GloriaSetup, verify a clean install and an update preserving local data, and confirm the release version with the owner before publication.

**The first demo is successful when I can open Ada offline, spend ten minutes reading, and come back the next morning to a familiar little construction site that exists because of those ten minutes. I should be able to see what I did, understand what to do next, and want to stay.**
