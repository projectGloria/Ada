use super::{collect, text, use_tag, Result};
use chrono::{Datelike, Days, Months, NaiveDate};
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Todo,
    InProgress,
    Done,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskDraft {
    title: String,
    due: Option<String>,
    tag_ids: Vec<i64>,
    new_tags: Vec<String>,
    notes: String,
    project_id: Option<i64>,
    important: bool,
    urgent: bool,
    recurrence: Option<String>,
    subtasks: Vec<Subtask>,
}

#[derive(Deserialize, Serialize)]
pub struct Subtask {
    title: String,
    done: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub(super) id: i64,
    pub(super) title: String,
    due: Option<String>,
    pub(super) done: bool,
    pub(super) status: Status,
    pub(super) tag_ids: Vec<i64>,
    last_tag_id: Option<i64>,
    pub(super) notes: String,
    pub(super) project_id: Option<i64>,
    important: bool,
    urgent: bool,
    recurrence: Option<String>,
    pub(super) subtasks: Vec<Subtask>,
    pub(super) previous_id: Option<i64>,
    completed_at: Option<i64>,
}

#[derive(Serialize)]
pub struct Project {
    pub(super) id: i64,
    name: String,
    archived: bool,
}

pub fn projects(db: &Connection) -> Result<Vec<Project>> {
    Ok(collect(
        db,
        "SELECT id, name, archived FROM projects ORDER BY archived, name",
        [],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                archived: row.get(2)?,
            })
        },
    )?)
}

pub fn create_project(db: &Connection, name: &str) -> Result<()> {
    let name = text(name, "Project name", 80)?;
    if db.execute(
        "INSERT INTO projects(name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        [&name],
    )? == 0
    {
        return Err("A project already uses that name. Check archived projects too.".into());
    }
    Ok(())
}

pub fn archive_project(db: &Connection, id: i64, archived: bool) -> Result<()> {
    db.execute(
        "UPDATE projects SET archived=?1 WHERE id=?2",
        params![archived, id],
    )?;
    Ok(())
}

pub fn tasks(db: &Connection) -> Result<Vec<Task>> {
    Ok(collect(
        db,
        "SELECT id, title, due, done, last_tag_id, notes, project_id, important, urgent,
        in_progress, recurrence, previous_id, completed_at FROM tasks ORDER BY done, id DESC",
        [],
        |row| read_task(db, row),
    )?)
}

fn read_task(db: &Connection, row: &Row<'_>) -> rusqlite::Result<Task> {
    let id = row.get::<_, i64>(0)?;
    let done = row.get::<_, bool>(3)?;
    let in_progress = row.get::<_, bool>(9)?;
    Ok(Task {
        id,
        done,
        title: row.get(1)?,
        due: row.get(2)?,
        last_tag_id: row.get(4)?,
        notes: row.get(5)?,
        project_id: row.get(6)?,
        important: row.get(7)?,
        urgent: row.get(8)?,
        recurrence: row.get(10)?,
        previous_id: row.get(11)?,
        completed_at: row.get(12)?,
        status: if done {
            Status::Done
        } else if in_progress {
            Status::InProgress
        } else {
            Status::Todo
        },
        tag_ids: collect(
            db,
            "SELECT tag_id FROM task_tags WHERE task_id=?1 ORDER BY tag_id",
            [id],
            |row| row.get(0),
        )?,
        subtasks: collect(
            db,
            "SELECT title, done FROM subtasks WHERE task_id=?1 ORDER BY position",
            [id],
            |row| {
                Ok(Subtask {
                    title: row.get(0)?,
                    done: row.get(1)?,
                })
            },
        )?,
    })
}

fn parse_due(value: Option<&str>) -> Result<Option<NaiveDate>> {
    value
        .map(|value| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .ok()
                .filter(|date| (1..=9999).contains(&date.year()))
                .ok_or_else(|| "Choose a valid due date.".into())
        })
        .transpose()
}

fn check_due(date: Option<NaiveDate>, recurrence: Option<&str>) -> Result<()> {
    if recurrence.is_some() && date.is_none() {
        return Err("Give recurring tasks a due date.".into());
    }
    Ok(())
}

pub fn save_task(db: &Connection, id: Option<i64>, draft: TaskDraft) -> Result<()> {
    let title = text(&draft.title, "Task name", 200)?;
    let notes = draft.notes.trim();
    if notes.chars().count() > 10_000 {
        return Err("Keep notes within 10,000 characters.".into());
    }
    let date = parse_due(draft.due.as_deref())?;
    let recurrence = draft.recurrence.as_deref();
    if !matches!(recurrence, None | Some("daily" | "weekly" | "monthly")) {
        return Err("Choose a valid repeat schedule.".into());
    }
    check_due(date, recurrence)?;
    let due = date.map(|date| date.to_string());
    let anchor = date.map(|date| date.day());
    if let Some(project_id) = draft.project_id {
        let archived: bool = db.query_row(
            "SELECT archived FROM projects WHERE id=?1",
            [project_id],
            |row| row.get(0),
        )?;
        if archived {
            let old = id
                .map(|id| {
                    db.query_row("SELECT project_id FROM tasks WHERE id=?1", [id], |row| {
                        row.get::<_, Option<i64>>(0)
                    })
                })
                .transpose()?
                .flatten();
            if old != Some(project_id) {
                return Err("Restore this project before assigning new tasks to it.".into());
            }
        }
    }
    let id = if let Some(id) = id {
        let changed = db.execute("UPDATE tasks SET title=?1, due=?2, notes=?3, project_id=?4, important=?5, urgent=?6,
            recurrence=?7, recurrence_day=CASE WHEN due IS ?2 AND recurrence IS ?7 THEN recurrence_day ELSE ?8 END WHERE id=?9",
            params![title, due, notes, draft.project_id, draft.important, draft.urgent, recurrence, anchor, id])?;
        if changed == 0 {
            return Err("This task could not be found.".into());
        }
        db.execute("DELETE FROM task_tags WHERE task_id=?1", [id])?;
        db.execute("DELETE FROM subtasks WHERE task_id=?1", [id])?;
        id
    } else {
        db.execute("INSERT INTO tasks(title, due, notes, project_id, important, urgent, recurrence, recurrence_day)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![title, due, notes, draft.project_id, draft.important, draft.urgent, recurrence, anchor])?;
        db.last_insert_rowid()
    };
    let mut tag_ids = draft.tag_ids;
    for name in draft.new_tags {
        tag_ids.push(use_tag(db, &text(&name, "Tag", 40)?)?);
    }
    for tag_id in tag_ids {
        db.execute(
            "INSERT INTO task_tags VALUES (?1, ?2) ON CONFLICT DO NOTHING",
            params![id, tag_id],
        )?;
    }
    db.execute(
        "UPDATE tasks SET last_tag_id=NULL WHERE id=?1 AND last_tag_id NOT IN
        (SELECT tag_id FROM task_tags WHERE task_id=?1)",
        [id],
    )?;
    for (position, subtask) in draft.subtasks.into_iter().enumerate() {
        db.execute(
            "INSERT INTO subtasks VALUES (?1, ?2, ?3, ?4)",
            params![
                id,
                position,
                text(&subtask.title, "Subtask name", 200)?,
                subtask.done
            ],
        )?;
    }
    Ok(())
}

fn following(date: NaiveDate, recurrence: &str, anchor: Option<u32>) -> Option<NaiveDate> {
    match recurrence {
        "daily" => date.checked_add_days(Days::new(1)),
        "weekly" => date.checked_add_days(Days::new(7)),
        "monthly" => date
            .with_day(1)
            .and_then(|first| first.checked_add_months(Months::new(1)))
            .and_then(|first| {
                let day = anchor.unwrap_or(date.day());
                (1..=day).rev().find_map(|day| first.with_day(day))
            }),
        _ => None,
    }
    .filter(|date| date.year() <= 9999)
}

/// The first date on the task's schedule after both its due date and today, so completing
/// overdue work never creates an occurrence that is already overdue.
fn next_occurrence(
    due: NaiveDate,
    recurrence: &str,
    anchor: Option<u32>,
    today: NaiveDate,
) -> Option<NaiveDate> {
    let mut next = following(due, recurrence, anchor)?;
    while next <= today {
        next = following(next, recurrence, anchor)?;
    }
    Some(next)
}

pub fn set_status(
    db: &Connection,
    id: i64,
    status: Status,
    now: i64,
    today: NaiveDate,
) -> Result<()> {
    let (was_done, due, recurrence, anchor): (bool, Option<String>, Option<String>, Option<u32>) =
        db.query_row(
            "SELECT done, due, recurrence, recurrence_day FROM tasks WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
    let done = matches!(status, Status::Done);
    db.execute(
        "UPDATE tasks SET done=?1, in_progress=?2,
        completed_at=CASE WHEN ?1 THEN COALESCE(completed_at, ?3) END WHERE id=?4",
        params![done, matches!(status, Status::InProgress), now, id],
    )?;
    let Some(recurrence) = recurrence.filter(|_| done && !was_done) else {
        return Ok(());
    };
    if db.query_row(
        "SELECT EXISTS(SELECT 1 FROM tasks WHERE previous_id=?1)",
        [id],
        |row| row.get::<_, bool>(0),
    )? {
        return Ok(());
    }
    let date = parse_due(due.as_deref())?.ok_or("This recurring task has no due date.")?;
    let next = next_occurrence(date, &recurrence, anchor, today)
        .ok_or("The next due date is outside the supported calendar.")?;
    db.execute("INSERT INTO tasks(title, due, last_tag_id, notes, project_id, important, urgent, recurrence, recurrence_day, previous_id)
        SELECT title, ?1, last_tag_id, notes, project_id, important, urgent, recurrence, recurrence_day, id
        FROM tasks WHERE id=?2", params![next.to_string(), id])?;
    let next_id = db.last_insert_rowid();
    db.execute(
        "INSERT INTO task_tags SELECT ?1, tag_id FROM task_tags WHERE task_id=?2",
        params![next_id, id],
    )?;
    db.execute(
        "INSERT INTO subtasks SELECT ?1, position, title, 0 FROM subtasks WHERE task_id=?2",
        params![next_id, id],
    )?;
    Ok(())
}

/// Removes a task while keeping its focus history: sessions keep their activity name,
/// tag, project, and credited time, and simply lose the link.
pub fn delete_task(db: &Connection, id: i64) -> Result<()> {
    db.execute("UPDATE sessions SET task_id=NULL WHERE task_id=?1", [id])?;
    db.execute(
        "UPDATE tasks SET previous_id=NULL WHERE previous_id=?1",
        [id],
    )?;
    db.execute("DELETE FROM task_tags WHERE task_id=?1", [id])?;
    if db.execute("DELETE FROM tasks WHERE id=?1", [id])? == 0 {
        return Err("That task no longer exists.".into());
    }
    Ok(())
}

pub(super) fn seed(db: &Connection) -> Result<()> {
    create_project(db, "Studio notebook")?;
    let project = db.last_insert_rowid();
    db.execute("UPDATE tasks SET project_id=?1, important=1 WHERE title IN
        ('Read chapter four of A Pattern Language', 'Sketch the project overview', 'File the research notes')", [project])?;
    db.execute(
        "UPDATE tasks SET in_progress=1 WHERE title='Sketch the project overview'",
        [],
    )?;
    db.execute(
        "UPDATE tasks SET urgent=1, important=1 WHERE title='Draft notes for Friday''s review'",
        [],
    )?;
    db.execute(
        "UPDATE tasks SET recurrence='weekly', recurrence_day=CAST(substr(due, 9, 2) AS INTEGER)
        WHERE title='Read chapter four of A Pattern Language'",
        [],
    )?;
    db.execute("INSERT INTO subtasks(task_id, position, title) SELECT id, 0, 'Note one pattern worth trying'
        FROM tasks WHERE title='Read chapter four of A Pattern Language'", [])?;
    db.execute(
        "UPDATE sessions SET project_id=?1 WHERE activity IN
        ('Read the introduction', 'Explore layout directions', 'File the research notes')",
        [project],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{Action, Store, MINUTE};

    fn task(project_id: Option<i64>) -> TaskDraft {
        TaskDraft {
            title: "Read a chapter".into(),
            due: Some("2027-01-31".into()),
            tag_ids: vec![],
            new_tags: vec!["Reading".into(), "Research".into()],
            notes: "Write down one useful idea".into(),
            project_id,
            important: true,
            urgent: true,
            recurrence: Some("monthly".into()),
            subtasks: vec![Subtask {
                title: "Pick the chapter".into(),
                done: true,
            }],
        }
    }

    #[test]
    fn planner_occurrences_and_sessions_share_the_same_task_without_duplicate_credit() {
        let now = 1_800_000_000_000;
        let mut store = Store::open_in_zone(":memory:", false, chrono_tz::UTC, now).unwrap();
        let mut apply = |action| store.apply_at(action, now).unwrap();
        let result = apply(Action::AddProject {
            name: "Study".into(),
        });
        let project_id = result.projects[0].id;
        let result = apply(Action::SaveTask {
            id: None,
            draft: task(Some(project_id)),
        });
        let original = &result.tasks[0];
        assert_eq!(original.status, Status::Todo);
        assert!(original.important && original.urgent);
        assert_eq!(original.project_id, Some(project_id));
        assert_eq!(original.tag_ids.len(), 2);
        let id = original.id;
        let tag_id = original.tag_ids[0];

        let result = apply(Action::SetStatus {
            id,
            status: Status::InProgress,
        });
        assert_eq!(result.tasks[0].status, Status::InProgress);
        let result = apply(Action::Start {
            task_id: Some(id),
            tag_id,
            target_ms: None,
        });
        let active = result.active.unwrap();
        assert_eq!(active.project_id, Some(project_id));
        let result = store
            .apply_at(Action::Finish { id: active.id }, now + 10 * MINUTE)
            .unwrap();
        assert_eq!(result.tags[0].total_ms, 10 * MINUTE);
        assert_eq!(result.tags[1].total_ms, 0);
        assert_eq!(result.sessions[0].task_id, Some(id));

        let mut apply = |action| store.apply_at(action, now + 10 * MINUTE).unwrap();
        let done = apply(Action::Complete { id, done: true });
        let next = done
            .tasks
            .iter()
            .find(|task| task.previous_id == Some(id))
            .unwrap();
        assert_eq!(next.due.as_deref(), Some("2027-02-28"));
        assert_eq!(next.status, Status::Todo);
        assert_eq!(next.project_id, Some(project_id));
        assert_eq!(next.tag_ids.len(), 2);
        assert_eq!(next.last_tag_id, Some(tag_id));
        assert!(next.important && next.urgent);
        assert!(!next.subtasks[0].done);
        let next_id = next.id;
        apply(Action::Complete { id, done: true });
        apply(Action::Complete { id, done: false });
        let done_again = apply(Action::SetStatus {
            id,
            status: Status::Done,
        });
        assert_eq!(done_again.tasks.len(), 2);
        let march = apply(Action::SetStatus {
            id: next_id,
            status: Status::Done,
        });
        assert_eq!(
            march
                .tasks
                .iter()
                .find(|task| task.previous_id == Some(next_id))
                .unwrap()
                .due
                .as_deref(),
            Some("2027-03-31")
        );

        let mut edit = task(None);
        edit.due = Some("2027-02-01".into());
        edit.title = "Read the next chapter".into();
        let edited = apply(Action::SaveTask {
            id: Some(id),
            draft: edit,
        });
        assert_eq!(
            edited
                .tasks
                .iter()
                .find(|task| task.id == id)
                .unwrap()
                .due
                .as_deref(),
            Some("2027-02-01")
        );
        assert_eq!(edited.sessions[0].project_id, Some(project_id));
        assert_eq!(edited.sessions[0].activity, "Read a chapter");
        let archived = apply(Action::ArchiveProject {
            id: project_id,
            archived: true,
        });
        assert!(archived.projects[0].archived);
        assert_eq!(archived.sessions[0].project_id, Some(project_id));
    }

    #[test]
    fn previous_database_keeps_planned_tasks_and_recorded_time_after_migration() {
        let now = 1_800_000_000_000;
        let directory = std::env::temp_dir().join(format!(
            "ada-migration-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("ada.sqlite3");
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch(include_str!("../schema.sql")).unwrap();
            crate::store::seed(&db, chrono_tz::UTC, now).unwrap();
            db.pragma_update(None, "user_version", 1).unwrap();
        }
        {
            let mut store = Store::open_in_zone(&path, true, chrono_tz::UTC, now).unwrap();
            let result = store.apply_at(Action::Read, now).unwrap();
            assert_eq!(result.tasks.len(), 6);
            assert!(result.tasks.iter().any(|task| task.status == Status::Done));
            assert!(result.tasks.iter().all(|task| task.subtasks.is_empty()));
            assert!(result.projects.is_empty());
            assert_eq!(result.sessions.len(), 8);
            assert!(result
                .sessions
                .iter()
                .all(|session| session.project_id.is_none()));
            assert_eq!(result.tags[0].total_ms, 105 * MINUTE);
        }
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
