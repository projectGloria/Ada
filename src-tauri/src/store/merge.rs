//! Moves everything recorded in one local workspace into another. Used when a guest
//! workspace joins an account and when a deleted account's work returns to this PC.

use super::{collect, lot_tag, Result, Store};
use rusqlite::{params, OptionalExtension, Transaction};
use serde::Serialize;
use std::{collections::HashMap, path::Path};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub tasks: i64,
    pub sessions: i64,
    pub tags: i64,
    pub projects: i64,
    pub notes: i64,
}

impl Counts {
    pub fn is_empty(&self) -> bool {
        self.tasks + self.sessions + self.tags + self.projects + self.notes == 0
    }
}

struct TaskRow {
    id: i64,
    title: String,
    due: Option<String>,
    done: bool,
    last_tag_id: Option<i64>,
    notes: String,
    project_id: Option<i64>,
    important: bool,
    urgent: bool,
    in_progress: bool,
    recurrence: Option<String>,
    recurrence_day: Option<i64>,
    previous_id: Option<i64>,
    completed_at: Option<i64>,
}

impl Store {
    pub fn counts(&self) -> Result<Counts> {
        Ok(self.db.query_row(
            "SELECT (SELECT COUNT(*) FROM tasks), (SELECT COUNT(*) FROM sessions),
            (SELECT COUNT(*) FROM tags), (SELECT COUNT(*) FROM projects),
            (SELECT COUNT(*) FROM notes)",
            [],
            |r| {
                Ok(Counts {
                    tasks: r.get(0)?,
                    sessions: r.get(1)?,
                    tags: r.get(2)?,
                    projects: r.get(3)?,
                    notes: r.get(4)?,
                })
            },
        )?)
    }

    /// Copies every tag, project, task, and finished session from `source` into this
    /// workspace and empties `source`, all in one transaction.
    pub fn absorb(&mut self, source: &Path) -> Result<()> {
        let path = source
            .to_str()
            .ok_or("Ada could not read the workspace path.")?;
        self.db.execute("ATTACH DATABASE ?1 AS source", [path])?;
        let result = (|| -> Result<()> {
            let tx = self.db.transaction()?;
            copy(&tx)?;
            tx.commit()?;
            Ok(())
        })();
        let detached = self.db.execute("DETACH DATABASE source", []);
        result?;
        detached?;
        Ok(())
    }
}

fn copy(tx: &Transaction<'_>) -> Result<()> {
    let running: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM source.sessions WHERE ended_at IS NULL)",
        [],
        |r| r.get(0),
    )?;
    if running {
        return Err("Finish your current focus session first.".into());
    }

    let mut tags = HashMap::new();
    for (id, name, archived) in collect(
        tx,
        "SELECT id, name, archived FROM source.tags ORDER BY lot",
        [],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, bool>(2)?,
            ))
        },
    )? {
        let before: Option<bool> = tx
            .query_row(
                "SELECT archived FROM main.tags WHERE name=?1",
                [&name],
                |r| r.get(0),
            )
            .optional()?;
        let new = lot_tag(tx, &name)?;
        // A tag stays visible if either workspace was still using it.
        let keep_archived = before.unwrap_or(true) && archived;
        tx.execute(
            "UPDATE main.tags SET archived=?1 WHERE id=?2",
            params![keep_archived, new],
        )?;
        tags.insert(id, new);
    }

    let mut projects = HashMap::new();
    for (id, name, archived) in collect(
        tx,
        "SELECT id, name, archived FROM source.projects ORDER BY id",
        [],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, bool>(2)?,
            ))
        },
    )? {
        tx.execute(
            "INSERT INTO main.projects(name, archived) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING",
            params![name, archived],
        )?;
        let new: i64 =
            tx.query_row("SELECT id FROM main.projects WHERE name=?1", [&name], |r| {
                r.get(0)
            })?;
        projects.insert(id, new);
    }

    let rows = collect(
        tx,
        "SELECT id, title, due, done, last_tag_id, notes, project_id, important, urgent,
        in_progress, recurrence, recurrence_day, previous_id, completed_at
        FROM source.tasks ORDER BY id",
        [],
        |r| {
            Ok(TaskRow {
                id: r.get(0)?,
                title: r.get(1)?,
                due: r.get(2)?,
                done: r.get(3)?,
                last_tag_id: r.get(4)?,
                notes: r.get(5)?,
                project_id: r.get(6)?,
                important: r.get(7)?,
                urgent: r.get(8)?,
                in_progress: r.get(9)?,
                recurrence: r.get(10)?,
                recurrence_day: r.get(11)?,
                previous_id: r.get(12)?,
                completed_at: r.get(13)?,
            })
        },
    )?;
    let mut tasks = HashMap::new();
    for task in rows {
        let map =
            |id: Option<i64>, ids: &HashMap<i64, i64>| id.and_then(|id| ids.get(&id).copied());
        tx.execute(
            "INSERT INTO main.tasks(title, due, done, last_tag_id, notes, project_id, important, urgent,
            in_progress, recurrence, recurrence_day, previous_id, completed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                task.title,
                task.due,
                task.done,
                map(task.last_tag_id, &tags),
                task.notes,
                map(task.project_id, &projects),
                task.important,
                task.urgent,
                task.in_progress,
                task.recurrence,
                task.recurrence_day,
                map(task.previous_id, &tasks),
                task.completed_at,
            ],
        )?;
        tasks.insert(task.id, tx.last_insert_rowid());
    }

    for (task, tag) in collect(
        tx,
        "SELECT task_id, tag_id FROM source.task_tags",
        [],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
    )? {
        if let (Some(task), Some(tag)) = (tasks.get(&task), tags.get(&tag)) {
            tx.execute(
                "INSERT OR IGNORE INTO main.task_tags VALUES (?1, ?2)",
                params![task, tag],
            )?;
        }
    }
    for (task, position, title, done) in collect(
        tx,
        "SELECT task_id, position, title, done FROM source.subtasks",
        [],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, bool>(3)?,
            ))
        },
    )? {
        if let Some(task) = tasks.get(&task) {
            tx.execute(
                "INSERT INTO main.subtasks VALUES (?1, ?2, ?3, ?4)",
                params![task, position, title, done],
            )?;
        }
    }

    let mut sessions = HashMap::new();
    for (id, tag, task, project, activity, target, started, ended) in collect(
        tx,
        "SELECT id, tag_id, task_id, project_id, activity, target_ms, started_at, ended_at
        FROM source.sessions ORDER BY id",
        [],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<i64>>(2)?,
                r.get::<_, Option<i64>>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<i64>>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
            ))
        },
    )? {
        let tag = *tags.get(&tag).ok_or("A session refers to a missing tag.")?;
        tx.execute(
            "INSERT INTO main.sessions(tag_id, task_id, project_id, activity, target_ms, started_at, ended_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                tag,
                task.and_then(|id| tasks.get(&id)),
                project.and_then(|id| projects.get(&id)),
                activity,
                target,
                started,
                ended
            ],
        )?;
        sessions.insert(id, tx.last_insert_rowid());
    }
    for (session, start, end) in collect(
        tx,
        "SELECT session_id, start, end FROM source.intervals",
        [],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
            ))
        },
    )? {
        if let Some(session) = sessions.get(&session) {
            tx.execute(
                "INSERT INTO main.intervals VALUES (?1, ?2, ?3)",
                params![session, start, end],
            )?;
        }
    }

    // Notes keep their text; a title that's taken here gets a number.
    for (title, body, folder, pinned, created, updated) in collect(
        tx,
        "SELECT title, body, folder, pinned, created_at, updated_at FROM source.notes ORDER BY id",
        [],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, bool>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            ))
        },
    )? {
        let mut name = title.clone();
        let mut n = 2;
        while tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM main.notes WHERE title=?1 COLLATE NOCASE)",
            [&name],
            |r| r.get::<_, bool>(0),
        )? {
            name = format!("{title} {n}");
            n += 1;
        }
        tx.execute(
            "INSERT INTO main.notes(title, body, folder, pinned, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![name, body, folder, pinned, created, updated],
        )?;
    }

    tx.execute(
        "INSERT OR IGNORE INTO main.note_folders(path) SELECT path FROM source.note_folders",
        [],
    )?;

    tx.execute_batch(
        "DELETE FROM source.note_folders; DELETE FROM source.notes; DELETE FROM source.intervals; DELETE FROM source.sessions; DELETE FROM source.subtasks;
        DELETE FROM source.task_tags; UPDATE source.tasks SET previous_id=NULL; DELETE FROM source.tasks;
        DELETE FROM source.projects; DELETE FROM source.tags;",
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::store::{Action, Store, MINUTE};

    fn temp_dir() -> std::path::PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "ada-merge-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir(&directory).unwrap();
        directory
    }

    #[test]
    fn merging_moves_guest_work_into_the_account_and_keeps_credit_once() {
        let now = 1_800_000_000_000;
        let directory = temp_dir();
        let guest_path = directory.join("ada.sqlite3");
        let account_path = directory.join("account.sqlite3");
        {
            // The guest workspace has the sample week; the account already uses "Reading".
            Store::open_in_zone(&guest_path, true, chrono_tz::UTC, now).unwrap();
            let mut account =
                Store::open_in_zone(&account_path, false, chrono_tz::UTC, now).unwrap();
            account
                .apply_at(
                    Action::AddTag {
                        name: "reading".into(),
                    },
                    now,
                )
                .unwrap();
        }
        let guest = Store::open_in_zone(&guest_path, false, chrono_tz::UTC, now).unwrap();
        let before = guest.counts().unwrap();
        assert_eq!(
            (before.tasks, before.sessions, before.tags, before.projects),
            (6, 8, 3, 1)
        );

        let mut account = Store::open_in_zone(&account_path, false, chrono_tz::UTC, now).unwrap();
        account.absorb(&guest_path).unwrap();
        assert!(guest.counts().unwrap().is_empty());

        let merged = account.apply_at(Action::Read, now).unwrap();
        assert_eq!(
            merged.tags.len(),
            3,
            "Reading is matched by name, not duplicated"
        );
        assert_eq!(merged.tasks.len(), 6);
        assert_eq!(merged.sessions.len(), 8);
        assert_eq!(merged.projects.len(), 1);
        let reading = merged
            .tags
            .iter()
            .find(|tag| tag.name == "reading")
            .unwrap();
        assert_eq!(reading.total_ms, 105 * MINUTE);
        let total: i64 = merged.tags.iter().map(|tag| tag.total_ms).sum();
        assert_eq!(total, 265 * MINUTE);
        assert!(merged.tasks.iter().any(|task| task.subtasks.len() == 1));
        // Windows can't remove a database file that is still open.
        drop((guest, account));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn merging_refuses_while_a_guest_session_is_running() {
        let now = 1_800_000_000_000;
        let directory = temp_dir();
        let guest_path = directory.join("ada.sqlite3");
        let mut guest = Store::open_in_zone(&guest_path, false, chrono_tz::UTC, now).unwrap();
        guest
            .apply_at(
                Action::AddTag {
                    name: "Reading".into(),
                },
                now,
            )
            .unwrap();
        guest
            .apply_at(
                Action::Start {
                    task_id: None,
                    tag_id: 1,
                    target_ms: None,
                },
                now,
            )
            .unwrap();
        let mut account = Store::open_in_zone(
            directory.join("account.sqlite3"),
            false,
            chrono_tz::UTC,
            now,
        )
        .unwrap();
        assert!(account.absorb(&guest_path).is_err());
        assert_eq!(guest.counts().unwrap().sessions, 1);
        drop((guest, account));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
