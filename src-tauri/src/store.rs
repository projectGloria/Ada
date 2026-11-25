use chrono::{DateTime, Days, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use std::{error::Error, path::Path};

mod planner;
use planner::{Project, Status, Task, TaskDraft};

const MINUTE: i64 = 60_000;
const GAP: i64 = 15_000;
type Result<T> = std::result::Result<T, Box<dyn Error>>;

pub struct Store {
    db: Connection,
    demo: bool,
    zone: Tz,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Action {
    Read,
    SaveTask {
        id: Option<i64>,
        draft: TaskDraft,
    },
    Complete {
        id: i64,
        done: bool,
    },
    SetStatus {
        id: i64,
        status: Status,
    },
    AddProject {
        name: String,
    },
    ArchiveProject {
        id: i64,
        archived: bool,
    },
    AddTag {
        name: String,
    },
    Start {
        task_id: Option<i64>,
        tag_id: i64,
        target_ms: Option<i64>,
    },
    Pause {
        id: i64,
    },
    Resume {
        id: i64,
    },
    Finish {
        id: i64,
    },
    Recover {
        id: i64,
        count: bool,
    },
    CorrectTag {
        id: i64,
        tag_id: i64,
    },
    CorrectTask {
        id: i64,
        task_id: Option<i64>,
    },
    DeleteSession {
        id: i64,
    },
    SaveSettings {
        startup: String,
        theme: String,
        town_visibility: String,
        notifications: bool,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    startup: String,
    theme: String,
    town_visibility: String,
    pub notifications: bool,
    last_target_ms: Option<i64>,
    onboarded: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Tag {
    id: i64,
    name: String,
    lot: i64,
    total_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    id: i64,
    tag_id: i64,
    task_id: Option<i64>,
    project_id: Option<i64>,
    activity: String,
    target_ms: Option<i64>,
    started_at: i64,
    ended_at: Option<i64>,
    running_since: Option<i64>,
    heartbeat_at: Option<i64>,
    recovery_to: Option<i64>,
    credited_ms: i64,
}

#[derive(Serialize)]
struct Interval {
    start: i64,
    end: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Day {
    date: String,
    total_ms: i64,
    credits: std::collections::BTreeMap<i64, i64>,
}

#[derive(Serialize)]
struct Milestone {
    stage: i64,
    minutes: i64,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    now: i64,
    today: String,
    zone: String,
    demo: bool,
    pub settings: Settings,
    tasks: Vec<Task>,
    projects: Vec<Project>,
    tags: Vec<Tag>,
    sessions: Vec<Session>,
    active: Option<Session>,
    week: Vec<Day>,
    milestones: Vec<Milestone>,
    session_intervals: std::collections::BTreeMap<i64, Vec<Interval>>,
}

const SESSION_SQL: &str = "SELECT id, tag_id, task_id, activity, target_ms, started_at, ended_at,
    running_since, heartbeat_at, recovery_to,
    (SELECT COALESCE(SUM(end-start), 0) FROM intervals WHERE session_id = sessions.id), project_id
    FROM sessions";

fn read_session(row: &Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        tag_id: row.get(1)?,
        task_id: row.get(2)?,
        activity: row.get(3)?,
        target_ms: row.get(4)?,
        started_at: row.get(5)?,
        ended_at: row.get(6)?,
        running_since: row.get(7)?,
        heartbeat_at: row.get(8)?,
        recovery_to: row.get(9)?,
        credited_ms: row.get(10)?,
        project_id: row.get(11)?,
    })
}

fn collect<T>(
    db: &Connection,
    sql: &str,
    args: impl rusqlite::Params,
    map: impl FnMut(&Row<'_>) -> rusqlite::Result<T>,
) -> rusqlite::Result<Vec<T>> {
    db.prepare(sql)?.query_map(args, map)?.collect()
}

fn current(db: &Connection) -> rusqlite::Result<Option<Session>> {
    db.query_row(
        &format!("{SESSION_SQL} WHERE ended_at IS NULL"),
        [],
        read_session,
    )
    .optional()
}

fn settings(db: &Connection) -> rusqlite::Result<Settings> {
    db.query_row("SELECT startup, theme, town_visibility, notifications, last_target_ms, onboarded FROM settings",
        [], |r| Ok(Settings {
            startup: r.get(0)?, theme: r.get(1)?, town_visibility: r.get(2)?,
            notifications: r.get(3)?, last_target_ms: r.get(4)?, onboarded: r.get(5)?,
        }))
}

fn text(value: &str, field: &str, limit: usize) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > limit {
        return Err(format!("{field} must be between 1 and {limit} characters.").into());
    }
    Ok(value.to_owned())
}

fn lot_tag(db: &Connection, name: &str) -> rusqlite::Result<i64> {
    db.execute(
        "INSERT INTO tags(name, lot) SELECT ?1, COALESCE(MAX(lot), -1) + 1 FROM tags WHERE true
                ON CONFLICT(name) DO NOTHING",
        [name],
    )?;
    db.query_row("SELECT id FROM tags WHERE name = ?1", [name], |r| r.get(0))
}

fn find_current(db: &Connection, id: i64) -> Result<Session> {
    current(db)?
        .filter(|session| session.id == id)
        .ok_or_else(|| "This focus session has already ended.".into())
}

fn end_running(db: &Connection, session: &Session, at: i64) -> Result<i64> {
    let mut end = at;
    if let Some(start) = session.running_since {
        if let Some(target) = session.target_ms {
            end = end.min(start + (target - session.credited_ms).max(0));
        }
        if end > start {
            db.execute(
                "INSERT INTO intervals(session_id, start, end) VALUES (?1, ?2, ?3)",
                params![session.id, start, end],
            )?;
        }
        end = end.max(start);
    }
    db.execute(
        "UPDATE sessions SET running_since=NULL, heartbeat_at=NULL, recovery_to=NULL WHERE id=?1",
        [session.id],
    )?;
    Ok(end)
}

fn finish(db: &Connection, session: &Session, at: i64) -> Result<()> {
    let end = end_running(db, session, at)?;
    db.execute(
        "UPDATE sessions SET ended_at=?1 WHERE id=?2",
        params![end, session.id],
    )?;
    Ok(())
}

fn checkpoint(db: &Connection, now: i64, reopening: bool) -> Result<bool> {
    let Some(session) = current(db)? else {
        return Ok(false);
    };
    let (Some(start), Some(heartbeat)) = (session.running_since, session.heartbeat_at) else {
        return Ok(false);
    };
    if session.recovery_to.is_some() {
        return Ok(false);
    }
    if reopening || now - heartbeat > GAP || now < heartbeat {
        db.execute(
            "UPDATE sessions SET recovery_to=?1 WHERE id=?2",
            params![now.max(heartbeat), session.id],
        )?;
        return Ok(false);
    }
    if let Some(target) = session.target_ms {
        if session.credited_ms + now - start >= target {
            finish(db, &session, now)?;
            return Ok(true);
        }
    }
    if now > heartbeat {
        db.execute(
            "UPDATE sessions SET heartbeat_at=?1 WHERE id=?2",
            params![now, session.id],
        )?;
    }
    Ok(false)
}

impl Store {
    pub fn open(path: impl AsRef<Path>, demo: bool) -> Result<Self> {
        let zone = iana_time_zone::get_timezone()
            .ok()
            .and_then(|name| name.parse().ok())
            .unwrap_or(chrono_tz::UTC);
        Self::open_in_zone(path, demo, zone, Utc::now().timestamp_millis())
    }

    fn open_in_zone(path: impl AsRef<Path>, demo: bool, zone: Tz, now: i64) -> Result<Self> {
        let mut db = Connection::open(path)?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        db.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )?;
        let tx = db.transaction()?;
        let version: i64 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if !(0..=2).contains(&version) {
            return Err("This database needs a newer version of Ada.".into());
        }
        if version == 0 {
            tx.execute_batch(include_str!("schema.sql"))?;
            if demo {
                seed(&tx, zone, now)?;
            }
        }
        if version < 2 {
            tx.execute_batch(include_str!("planner.sql"))?;
            if version == 0 && demo {
                planner::seed(&tx)?;
            }
            tx.pragma_update(None, "user_version", 2)?;
        }
        checkpoint(&tx, now, true)?;
        tx.commit()?;
        Ok(Self { db, demo, zone })
    }

    pub fn tick(&mut self) -> Result<bool> {
        let tx = self.db.transaction()?;
        let expired = checkpoint(&tx, Utc::now().timestamp_millis(), false)?;
        let should_notify = expired && settings(&tx)?.notifications;
        tx.commit()?;
        Ok(should_notify)
    }

    pub fn apply(&mut self, action: Action) -> Result<Snapshot> {
        self.apply_at(action, Utc::now().timestamp_millis())
    }

    fn apply_at(&mut self, action: Action, now: i64) -> Result<Snapshot> {
        let tx = self.db.transaction()?;
        mutate(&tx, action, now)?;
        let snapshot = snapshot(&tx, self.demo, self.zone, now)?;
        tx.commit()?;
        Ok(snapshot)
    }
}

fn mutate(tx: &Transaction<'_>, action: Action, now: i64) -> Result<()> {
    match action {
        Action::Read => {}
        Action::SaveTask { id, draft } => planner::save_task(tx, id, draft)?,
        Action::Complete { id, done } => {
            planner::set_status(tx, id, if done { Status::Done } else { Status::Todo })?;
        }
        Action::SetStatus { id, status } => planner::set_status(tx, id, status)?,
        Action::AddProject { name } => planner::create_project(tx, &name)?,
        Action::ArchiveProject { id, archived } => planner::archive_project(tx, id, archived)?,
        Action::AddTag { name } => {
            lot_tag(tx, &text(&name, "Tag", 40)?)?;
        }
        Action::Start {
            task_id,
            tag_id,
            target_ms,
        } => {
            if current(tx)?.is_some() {
                return Err(
                    "Return to or finish your current session before starting another.".into(),
                );
            }
            if target_ms.is_some_and(|target| !(MINUTE..=1_440 * MINUTE).contains(&target)) {
                return Err("Choose a countdown between 1 and 1,440 minutes.".into());
            }
            let tag: String =
                tx.query_row("SELECT name FROM tags WHERE id=?1", [tag_id], |r| r.get(0))?;
            let (activity, project_id) = if let Some(id) = task_id {
                let (title, project_id) = tx.query_row(
                    "SELECT title, project_id FROM tasks WHERE id=?1",
                    [id],
                    |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<i64>>(1)?)),
                )?;
                let (count, has_tag): (i64, bool) = tx.query_row(
                    "SELECT COUNT(*), COALESCE(MAX(tag_id=?2), 0) FROM task_tags WHERE task_id=?1",
                    params![id, tag_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )?;
                if count == 0 {
                    tx.execute("INSERT INTO task_tags VALUES (?1, ?2)", params![id, tag_id])?;
                } else if !has_tag {
                    return Err("Choose a focus tag assigned to this task.".into());
                }
                tx.execute(
                    "UPDATE tasks SET last_tag_id=?1 WHERE id=?2",
                    params![tag_id, id],
                )?;
                (title, project_id)
            } else {
                (tag, None)
            };
            tx.execute("INSERT INTO sessions(tag_id, task_id, project_id, activity, target_ms, started_at, running_since, heartbeat_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?6)", params![tag_id, task_id, project_id, activity, target_ms, now])?;
            tx.execute(
                "UPDATE settings SET last_target_ms=?1 WHERE id=1",
                [target_ms],
            )?;
        }
        Action::Pause { id } => {
            let session = controllable(tx, id)?;
            end_running(tx, &session, now)?;
        }
        Action::Resume { id } => {
            let session = controllable(tx, id)?;
            if session.running_since.is_none() {
                // A backward clock adjustment must not make two credited intervals overlap.
                let last: Option<i64> = tx.query_row(
                    "SELECT MAX(end) FROM intervals WHERE session_id=?1",
                    [id],
                    |r| r.get(0),
                )?;
                if last.is_some_and(|end| now < end) {
                    return Err("The system clock is earlier than your last focus interval. Check the Windows clock before resuming.".into());
                }
                tx.execute(
                    "UPDATE sessions SET running_since=?1, heartbeat_at=?1 WHERE id=?2",
                    params![now, id],
                )?;
            }
        }
        Action::Finish { id } => {
            let session = controllable(tx, id)?;
            finish(tx, &session, now)?;
        }
        Action::Recover { id, count } => {
            let session = find_current(tx, id)?;
            let recovery_to = session
                .recovery_to
                .ok_or("This session has no interval to review.")?;
            let end = end_running(
                tx,
                &session,
                if count {
                    recovery_to
                } else {
                    session.heartbeat_at.unwrap_or(recovery_to)
                },
            )?;
            let credited = end - session.running_since.unwrap_or(end) + session.credited_ms;
            if session.target_ms.is_some_and(|target| credited >= target) {
                tx.execute(
                    "UPDATE sessions SET ended_at=?1 WHERE id=?2",
                    params![end, id],
                )?;
            }
        }
        Action::CorrectTag { id, tag_id } => {
            tx.execute(
                "UPDATE sessions SET tag_id=?1 WHERE id=?2 AND ended_at IS NOT NULL",
                params![tag_id, id],
            )?;
        }
        Action::CorrectTask { id, task_id } => {
            tx.execute(
                "UPDATE sessions SET task_id=?1 WHERE id=?2 AND ended_at IS NOT NULL",
                params![task_id, id],
            )?;
        }
        Action::DeleteSession { id } => {
            tx.execute(
                "DELETE FROM sessions WHERE id=?1 AND ended_at IS NOT NULL",
                [id],
            )?;
        }
        Action::SaveSettings {
            startup,
            theme,
            town_visibility,
            notifications,
        } => {
            if !["today", "focus", "town", "reports"].contains(&startup.as_str())
                || !["dark", "light", "system"].contains(&theme.as_str())
                || !["focus", "town"].contains(&town_visibility.as_str())
            {
                return Err("Choose one of the available settings.".into());
            }
            tx.execute("UPDATE settings SET startup=?1, theme=?2, town_visibility=?3, notifications=?4, onboarded=1 WHERE id=1",
                       params![startup, theme, town_visibility, notifications])?;
        }
    }
    Ok(())
}

fn controllable(db: &Connection, id: i64) -> Result<Session> {
    let session = find_current(db, id)?;
    if session.recovery_to.is_some() {
        return Err("Review the interrupted interval before controlling the timer.".into());
    }
    Ok(session)
}

fn local_date(zone: Tz, at: i64) -> NaiveDate {
    DateTime::from_timestamp_millis(at)
        .expect("current timestamp")
        .with_timezone(&zone)
        .date_naive()
}

fn day_start(zone: Tz, date: NaiveDate) -> i64 {
    let midnight = date.and_hms_opt(0, 0, 0).expect("valid midnight");
    // Some zones advance clocks at midnight or skip a calendar date.
    for minute in 0..=1_440 {
        if let Some(time) = zone
            .from_local_datetime(&(midnight + chrono::Duration::minutes(minute)))
            .earliest()
        {
            return time.timestamp_millis();
        }
    }
    unreachable!("time zone has no valid local time in 24 hours")
}

fn snapshot(db: &Connection, demo: bool, zone: Tz, now: i64) -> Result<Snapshot> {
    let today = local_date(zone, now);
    let tasks = planner::tasks(db)?;
    let tags = collect(
        db,
        "SELECT tags.id, name, lot, COALESCE(SUM(intervals.end-intervals.start), 0)
        FROM tags LEFT JOIN sessions ON sessions.tag_id=tags.id AND sessions.ended_at IS NOT NULL
        LEFT JOIN intervals ON intervals.session_id=sessions.id GROUP BY tags.id ORDER BY lot",
        [],
        |r| {
            Ok(Tag {
                id: r.get(0)?,
                name: r.get(1)?,
                lot: r.get(2)?,
                total_ms: r.get(3)?,
            })
        },
    )?;
    let sessions = collect(
        db,
        &format!("{SESSION_SQL} WHERE ended_at IS NOT NULL ORDER BY started_at DESC, id DESC"),
        [],
        read_session,
    )?;
    let mut session_intervals = std::collections::BTreeMap::<i64, Vec<Interval>>::new();
    for (id, interval) in collect(
        db,
        "SELECT session_id, start, end FROM intervals ORDER BY session_id, start",
        [],
        |r| {
            Ok((
                r.get(0)?,
                Interval {
                    start: r.get(1)?,
                    end: r.get(2)?,
                },
            ))
        },
    )? {
        let intervals = session_intervals.entry(id).or_default();
        if let Some(previous) = intervals
            .last_mut()
            .filter(|previous| previous.end == interval.start)
        {
            previous.end = interval.end;
        } else {
            intervals.push(interval);
        }
    }
    let mut week = Vec::new();
    for offset in (0..7).rev() {
        let date = today - Days::new(offset);
        let start = day_start(zone, date);
        let end = day_start(zone, date + Days::new(1));
        let mut day = Day {
            date: date.to_string(),
            total_ms: 0,
            credits: std::collections::BTreeMap::new(),
        };
        for session in &sessions {
            let credit = session_intervals
                .get(&session.id)
                .into_iter()
                .flatten()
                .map(|i| (i.end.min(end) - i.start.max(start)).max(0))
                .sum::<i64>();
            if credit > 0 {
                day.total_ms += credit;
                day.credits.insert(session.id, credit);
            }
        }
        week.push(day);
    }
    let milestones = collect(
        db,
        "SELECT stage, minutes, label FROM progression WHERE version=1 ORDER BY stage",
        [],
        |r| {
            Ok(Milestone {
                stage: r.get(0)?,
                minutes: r.get(1)?,
                label: r.get(2)?,
            })
        },
    )?;
    Ok(Snapshot {
        now,
        today: today.to_string(),
        zone: zone.name().to_owned(),
        demo,
        settings: settings(db)?,
        tasks,
        projects: planner::projects(db)?,
        tags,
        sessions,
        active: current(db)?,
        week,
        milestones,
        session_intervals,
    })
}

fn seed(db: &Connection, zone: Tz, now: i64) -> Result<()> {
    db.execute("UPDATE settings SET onboarded=1 WHERE id=1", [])?;
    let reading = lot_tag(db, "Reading")?;
    let design = lot_tag(db, "Design")?;
    let writing = lot_tag(db, "Writing")?;
    let today = local_date(zone, now);
    for (title, due, tag, done) in [
        (
            "File the research notes",
            Some(today.to_string()),
            writing,
            true,
        ),
        (
            "Read chapter four of A Pattern Language",
            Some(today.to_string()),
            reading,
            false,
        ),
        (
            "Sketch the project overview",
            Some(today.to_string()),
            design,
            false,
        ),
        (
            "Draft notes for Friday's review",
            Some((today - Days::new(1)).to_string()),
            writing,
            false,
        ),
        (
            "Collect references for the studio wall",
            None,
            design,
            false,
        ),
        (
            "Write a short recap for next week",
            Some((today + Days::new(2)).to_string()),
            writing,
            false,
        ),
    ] {
        db.execute(
            "INSERT INTO tasks(title, due, done) VALUES (?1, ?2, ?3)",
            params![title, due, done],
        )?;
        db.execute(
            "INSERT INTO task_tags VALUES (?1, ?2)",
            params![db.last_insert_rowid(), tag],
        )?;
    }
    for (days, minutes, tag, activity) in [
        (6, 35, reading, "Read the introduction"),
        (5, 50, design, "Explore layout directions"),
        (4, 22, writing, "Outline the studio notes"),
        (3, 40, reading, "Read about public squares"),
        (2, 45, design, "Refine the project overview"),
        (1, 30, reading, "Read about quiet corners"),
        (1, 18, design, "Sort the visual references"),
        (0, 25, writing, "File the research notes"),
    ] {
        let day = today - Days::new(days);
        let start = if days == 0 {
            now - 90 * MINUTE
        } else {
            day_start(zone, day) + (9 * 60 + if tag == design { 120 } else { 0 }) * MINUTE
        };
        let end = start + minutes * MINUTE;
        db.execute(
            "INSERT INTO sessions(tag_id, activity, target_ms, started_at, ended_at)
                    VALUES (?1, ?2, ?3, ?4, ?5)",
            params![tag, activity, minutes * MINUTE, start, end],
        )?;
        db.execute(
            "INSERT INTO intervals VALUES (?1, ?2, ?3)",
            params![db.last_insert_rowid(), start, end],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(now: i64, zone: Tz) -> Store {
        let mut store = Store::open_in_zone(":memory:", false, zone, now).unwrap();
        for name in ["Reading", "Design"] {
            store
                .apply_at(
                    Action::AddTag {
                        name: name.to_owned(),
                    },
                    now,
                )
                .unwrap();
        }
        store
    }

    fn start(store: &mut Store, now: i64, target_ms: Option<i64>) -> i64 {
        store
            .apply_at(
                Action::Start {
                    task_id: None,
                    tag_id: 1,
                    target_ms,
                },
                now,
            )
            .unwrap()
            .active
            .unwrap()
            .id
    }

    #[test]
    fn early_finish_counts_focused_intervals_and_moves_credit_when_corrected() {
        let now = 1_800_000_000_000;
        let mut store = store(now, chrono_tz::UTC);
        let id = start(&mut store, now, Some(45 * MINUTE));
        store
            .apply_at(Action::Pause { id }, now + 5 * MINUTE)
            .unwrap();
        store
            .apply_at(Action::Resume { id }, now + 15 * MINUTE)
            .unwrap();
        let saved = store
            .apply_at(Action::Finish { id }, now + 22 * MINUTE)
            .unwrap();
        assert_eq!(saved.sessions[0].credited_ms, 12 * MINUTE);
        assert_eq!(saved.tags[0].total_ms, 12 * MINUTE);
        assert_eq!(saved.session_intervals[&id].len(), 2);

        let moved = store
            .apply_at(Action::CorrectTag { id, tag_id: 2 }, now + 22 * MINUTE)
            .unwrap();
        assert_eq!(moved.tags[0].total_ms, 0);
        assert_eq!(moved.tags[1].total_ms, 12 * MINUTE);
        assert_eq!(moved.week.last().unwrap().total_ms, 12 * MINUTE);

        let deleted = store
            .apply_at(Action::DeleteSession { id }, now + 22 * MINUTE)
            .unwrap();
        assert!(deleted.sessions.is_empty());
        assert!(deleted.session_intervals.is_empty());
        assert_eq!(deleted.tags[1].total_ms, 0);
    }

    #[test]
    fn expiry_credits_the_target_once_even_when_the_checkpoint_is_late() {
        let now = 1_800_000_000_000;
        let mut store = store(now, chrono_tz::UTC);
        let id = start(&mut store, now, Some(MINUTE));
        for second in 1..60 {
            assert!(!checkpoint(&store.db, now + second * 1_000, false).unwrap());
        }
        assert!(checkpoint(&store.db, now + 65_000, false).unwrap());
        assert!(!checkpoint(&store.db, now + 66_000, false).unwrap());
        let saved = store.apply_at(Action::Read, now + 66_000).unwrap();
        assert_eq!(saved.sessions[0].credited_ms, MINUTE);
        assert_eq!(saved.sessions[0].ended_at, Some(now + MINUTE));
        assert_eq!(saved.session_intervals[&id].len(), 1);
    }

    #[test]
    fn interrupted_countdown_can_exclude_the_gap_or_count_up_to_its_limit() {
        let now = 1_800_000_000_000;
        for count in [false, true] {
            let mut store = store(now, chrono_tz::UTC);
            let id = start(&mut store, now, Some(MINUTE));
            checkpoint(&store.db, now + 8_000, false).unwrap();
            checkpoint(&store.db, now + 10_000, false).unwrap();
            checkpoint(&store.db, now + 90_000, true).unwrap();
            assert!(store.apply_at(Action::Finish { id }, now + 90_000).is_err());
            let saved = store
                .apply_at(Action::Recover { id, count }, now + 90_000)
                .unwrap();
            if count {
                assert_eq!(saved.sessions[0].credited_ms, MINUTE);
                assert!(saved.active.is_none());
            } else {
                let active = saved.active.unwrap();
                assert_eq!(active.credited_ms, 10_000);
                assert!(active.running_since.is_none());
            }
        }
    }

    #[test]
    fn credits_split_at_local_midnight_on_the_fall_back_weekend() {
        let zone = chrono_tz::America::New_York;
        let midnight = day_start(zone, NaiveDate::from_ymd_opt(2026, 11, 1).unwrap());
        let next = day_start(zone, NaiveDate::from_ymd_opt(2026, 11, 2).unwrap());
        assert_eq!(next - midnight, 25 * 60 * MINUTE);
        let mut store = store(midnight - 10 * MINUTE, zone);
        let id = start(&mut store, midnight - 10 * MINUTE, None);
        let saved = store
            .apply_at(Action::Finish { id }, midnight + 130 * MINUTE)
            .unwrap();
        assert_eq!(saved.week[5].credits[&id], 10 * MINUTE);
        assert_eq!(saved.week[6].credits[&id], 130 * MINUTE);
        assert_eq!(saved.tags[0].total_ms, 140 * MINUTE);

        let following_day = store.apply_at(Action::Read, next).unwrap();
        assert_eq!(following_day.week.last().unwrap().total_ms, 0);
        assert_eq!(following_day.tags[0].lot, saved.tags[0].lot);
        assert_eq!(following_day.tags[0].total_ms, 140 * MINUTE);
    }
}
