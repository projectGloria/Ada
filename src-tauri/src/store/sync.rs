//! Sync between PCs for a signed-in account.
//!
//! Every synced row has a `uid`. SQLite triggers (`sync.sql`) mark a record in
//! `sync_dirty` in the same transaction as any local change. A sync round resends any
//! unanswered operations, pulls the server's changes by revision, merges them field by
//! field against `sync_shadow` (the last server version this PC saw), and pushes what's
//! left. The store lock is never held during network calls.

use super::{collect, describe, planner, Result, Store};
use chrono::DateTime;
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
    sync::Mutex,
};
use uuid::Uuid;

type Fields = Map<String, Value>;

pub const OFFLINE: &str =
    "Ada couldn't reach the account service. Check your connection. Your work is still saved on this PC.";
pub const SYNC_MISSING: &str =
    "Sync isn't set up on the account service yet. Your work is still saved on this PC.";

/// Records pushed per call; the server accepts at most 200.
const BATCH: usize = 200;
/// Roughly how much field text one push carries before the rest waits for the next.
const PUSH_BYTES: usize = 4_000_000;
/// Records pulled per call.
pub const PAGE: usize = 1000;
const NAMESPACE: Uuid = Uuid::from_u128(0x5c0f_3a7e_8d2b_4e61_9f43_a1d0_7b6e_2c19);

/// The `ada_uuid` SQL function: a random UUID, or one derived from a kind and a name so
/// that two PCs naming the same thing get the same id.
pub fn uuid(kind: Option<&str>, name: Option<&str>) -> String {
    match (kind, name) {
        (Some(kind), Some(name)) => {
            Uuid::new_v5(&NAMESPACE, format!("{kind}:{}", name.to_lowercase()).as_bytes())
        }
        _ => Uuid::new_v4(),
    }
    .to_string()
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Record {
    pub kind: String,
    pub id: String,
    #[serde(default)]
    pub fields: Fields,
    #[serde(default)]
    pub deleted: bool,
    pub revision: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Op {
    pub op_id: String,
    pub kind: String,
    pub id: String,
    pub base: i64,
    pub fields: Fields,
    #[serde(default)]
    pub delete: bool,
    #[serde(default)]
    pub restore: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub op_id: String,
    pub status: String,
    #[serde(default)]
    pub conflicts: Vec<String>,
    pub record: Option<Record>,
}

#[derive(Debug, Clone)]
pub struct RemoteError {
    /// The access token was refused; get a fresh one and try again.
    pub expired: bool,
    pub message: String,
}

impl RemoteError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            expired: false,
            message: message.into(),
        }
    }
}

/// The account service as sync sees it.
pub trait Remote {
    fn push(&self, device: &str, ops: &[Op]) -> std::result::Result<Vec<Outcome>, RemoteError>;
    fn pull(&self, since: i64, limit: usize) -> std::result::Result<Vec<Record>, RemoteError>;
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncInfo {
    pending: i64,
    conflicts: Vec<ConflictView>,
    last_synced_at: Option<i64>,
    last_error: Option<String>,
    /// Why the last round failed: "offline", "setup" (the sync migration isn't applied), or "other".
    problem: Option<&'static str>,
    pub(super) syncing: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConflictView {
    id: i64,
    kind: String,
    item: String,
    field: String,
    mine: String,
    theirs: String,
    at: i64,
}

struct Shadow {
    fields: Fields,
    deleted: bool,
    revision: i64,
}

fn table(kind: &str) -> &'static str {
    match kind {
        "tag" => "tags",
        "project" => "projects",
        "task" => "tasks",
        "note" => "notes",
        _ => "sessions",
    }
}

fn order(kind: &str) -> u8 {
    match kind {
        "tag" => 0,
        "project" => 1,
        "task" => 2,
        "note" => 4,
        _ => 3,
    }
}

fn object(value: Value) -> Fields {
    match value {
        Value::Object(map) => map,
        _ => Fields::new(),
    }
}

fn text<'a>(fields: &'a Fields, key: &str) -> Option<&'a str> {
    fields.get(key).and_then(Value::as_str)
}

fn flag(fields: &Fields, key: &str) -> bool {
    fields.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn number(fields: &Fields, key: &str) -> Option<i64> {
    fields.get(key).and_then(Value::as_i64)
}

fn list<'a>(fields: &'a Fields, key: &str) -> &'a [Value] {
    fields
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn id_of(db: &Connection, kind: &str, uid: &str) -> rusqlite::Result<Option<i64>> {
    db.query_row(
        &format!("SELECT id FROM {} WHERE uid=?1", table(kind)),
        [uid],
        |r| r.get(0),
    )
    .optional()
}

fn shadow(db: &Connection, kind: &str, uid: &str) -> Result<Option<Shadow>> {
    let row: Option<(String, bool, i64)> = db
        .query_row(
            "SELECT fields, deleted, revision FROM sync_shadow WHERE kind=?1 AND uid=?2",
            [kind, uid],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    Ok(match row {
        Some((fields, deleted, revision)) => Some(Shadow {
            fields: serde_json::from_str(&fields)?,
            deleted,
            revision,
        }),
        None => None,
    })
}

fn set_shadow(db: &Connection, record: &Record) -> Result<()> {
    db.execute(
        "INSERT OR REPLACE INTO sync_shadow(kind, uid, fields, deleted, revision) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            record.kind,
            record.id,
            serde_json::to_string(&record.fields)?,
            record.deleted,
            record.revision
        ],
    )?;
    db.execute(
        "DELETE FROM sync_inbox WHERE kind=?1 AND uid=?2",
        [&record.kind, &record.id],
    )?;
    Ok(())
}

fn mark(db: &Connection, kind: &str, uid: &str) -> rusqlite::Result<()> {
    db.execute(
        "INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES (?1, ?2)",
        [kind, uid],
    )
    .map(drop)
}

fn unmark(db: &Connection, kind: &str, uid: &str) -> rusqlite::Result<()> {
    db.execute(
        "DELETE FROM sync_dirty WHERE kind=?1 AND uid=?2",
        [kind, uid],
    )
    .map(drop)
}

fn is_dirty(db: &Connection, kind: &str, uid: &str) -> rusqlite::Result<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM sync_dirty WHERE kind=?1 AND uid=?2)",
        [kind, uid],
        |r| r.get(0),
    )
}

fn conflict(
    db: &Connection,
    record: &Record,
    field: &str,
    mine: &Value,
    theirs: &Value,
    now: i64,
) -> Result<()> {
    db.execute(
        "INSERT INTO sync_conflicts(kind, uid, field, mine, theirs, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(kind, uid, field) DO UPDATE SET mine=excluded.mine, theirs=excluded.theirs, at=excluded.at",
        params![
            record.kind,
            record.id,
            field,
            serde_json::to_string(mine)?,
            serde_json::to_string(theirs)?,
            now
        ],
    )?;
    Ok(())
}

/// The synced fields of a record as this PC has it, or `None` when it doesn't exist here.
/// A session only counts once it has ended.
fn read_local(db: &Connection, kind: &str, uid: &str) -> rusqlite::Result<Option<Fields>> {
    Ok(match kind {
        "tag" => db
            .query_row(
                "SELECT name, archived, lot FROM tags WHERE uid=?1",
                [uid],
                |r| {
                    Ok(object(json!({
                        "name": r.get::<_, String>(0)?,
                        "archived": r.get::<_, bool>(1)?,
                        "lot": r.get::<_, i64>(2)?,
                    })))
                },
            )
            .optional()?,
        "project" => db
            .query_row(
                "SELECT name, archived FROM projects WHERE uid=?1",
                [uid],
                |r| {
                    Ok(object(json!({
                        "name": r.get::<_, String>(0)?,
                        "archived": r.get::<_, bool>(1)?,
                    })))
                },
            )
            .optional()?,
        "task" => {
            let Some((id, mut fields)) = db
                .query_row(
                    "SELECT t.id, t.title, t.due, t.notes, (SELECT uid FROM projects WHERE id=t.project_id),
                    t.important, t.urgent, t.recurrence, t.recurrence_day,
                    (SELECT p.uid FROM tasks p WHERE p.id=t.previous_id),
                    (SELECT uid FROM tags WHERE id=t.last_tag_id), t.done, t.in_progress, t.completed_at
                    FROM tasks t WHERE t.uid=?1",
                    [uid],
                    |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            object(json!({
                                "title": r.get::<_, String>(1)?,
                                "due": r.get::<_, Option<String>>(2)?,
                                "notes": r.get::<_, String>(3)?,
                                "project": r.get::<_, Option<String>>(4)?,
                                "important": r.get::<_, bool>(5)?,
                                "urgent": r.get::<_, bool>(6)?,
                                "recurrence": r.get::<_, Option<String>>(7)?,
                                "recurrenceDay": r.get::<_, Option<i64>>(8)?,
                                "previous": r.get::<_, Option<String>>(9)?,
                                "lastTag": r.get::<_, Option<String>>(10)?,
                                "status": {
                                    "done": r.get::<_, bool>(11)?,
                                    "inProgress": r.get::<_, bool>(12)?,
                                    "completedAt": r.get::<_, Option<i64>>(13)?,
                                },
                            })),
                        ))
                    },
                )
                .optional()?
            else {
                return Ok(None);
            };
            let tags = collect(
                db,
                "SELECT tags.uid FROM task_tags JOIN tags ON tags.id=task_tags.tag_id
                WHERE task_id=?1 ORDER BY tags.uid",
                [id],
                |r| r.get::<_, String>(0),
            )?;
            let subtasks = collect(
                db,
                "SELECT title, done FROM subtasks WHERE task_id=?1 ORDER BY position",
                [id],
                |r| {
                    Ok(json!({ "title": r.get::<_, String>(0)?, "done": r.get::<_, bool>(1)? }))
                },
            )?;
            fields.insert("tags".into(), json!(tags));
            fields.insert("subtasks".into(), Value::Array(subtasks));
            Some(fields)
        }
        "session" => {
            let Some((id, mut fields)) = db
                .query_row(
                    "SELECT s.id, (SELECT uid FROM tags WHERE id=s.tag_id), (SELECT uid FROM tasks WHERE id=s.task_id),
                    (SELECT uid FROM projects WHERE id=s.project_id), s.activity, s.target_ms, s.started_at, s.ended_at
                    FROM sessions s WHERE s.uid=?1 AND s.ended_at IS NOT NULL",
                    [uid],
                    |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            object(json!({
                                "tag": r.get::<_, Option<String>>(1)?,
                                "task": r.get::<_, Option<String>>(2)?,
                                "project": r.get::<_, Option<String>>(3)?,
                                "activity": r.get::<_, String>(4)?,
                                "targetMs": r.get::<_, Option<i64>>(5)?,
                                "startedAt": r.get::<_, i64>(6)?,
                                "endedAt": r.get::<_, i64>(7)?,
                            })),
                        ))
                    },
                )
                .optional()?
            else {
                return Ok(None);
            };
            let intervals = collect(
                db,
                "SELECT start, end FROM intervals WHERE session_id=?1 ORDER BY start",
                [id],
                |r| Ok(json!([r.get::<_, i64>(0)?, r.get::<_, i64>(1)?])),
            )?;
            fields.insert("intervals".into(), Value::Array(intervals));
            Some(fields)
        }
        "note" => db
            .query_row(
                "SELECT title, body, folder, pinned, created_at FROM notes WHERE uid=?1",
                [uid],
                |r| {
                    Ok(object(json!({
                        "title": r.get::<_, String>(0)?,
                        "body": r.get::<_, String>(1)?,
                        "folder": r.get::<_, String>(2)?,
                        "pinned": r.get::<_, bool>(3)?,
                        "createdAt": r.get::<_, i64>(4)?,
                    })))
                },
            )
            .optional()?,
        _ => None,
    })
}

/// Resolves a reference to another record. `None` means it hasn't arrived yet, so the
/// record waits in the inbox; `Some(None)` means no reference, or one to a record that is
/// gone for good.
fn reference(db: &Connection, kind: &str, value: Option<&Value>) -> Result<Option<Option<i64>>> {
    let Some(uid) = value.and_then(Value::as_str) else {
        return Ok(Some(None));
    };
    if let Some(id) = id_of(db, kind, uid)? {
        return Ok(Some(Some(id)));
    }
    Ok(if shadow(db, kind, uid)?.is_some() {
        Some(None)
    } else {
        None
    })
}

/// Writes a record's fields into this PC's tables. Returns false when it refers to a record
/// that hasn't arrived yet.
fn write_local(db: &Connection, kind: &str, uid: &str, fields: &Fields) -> Result<bool> {
    match kind {
        "tag" | "project" => write_named(db, kind, uid, fields).map(|_| true),
        "task" => write_task(db, uid, fields),
        "session" => write_session(db, uid, fields),
        "note" => write_note(db, uid, fields).map(|_| true),
        _ => Ok(true),
    }
}

fn free_name(db: &Connection, kind: &str, name: &str) -> rusqlite::Result<String> {
    let mut n = 2;
    loop {
        let candidate = format!("{name} ({n})");
        let taken: bool = db.query_row(
            &format!(
                "SELECT EXISTS(SELECT 1 FROM {} WHERE name=?1)",
                table(kind)
            ),
            [&candidate],
            |r| r.get(0),
        )?;
        if !taken {
            return Ok(candidate);
        }
        n += 1;
    }
}

fn write_named(db: &Connection, kind: &str, uid: &str, fields: &Fields) -> Result<()> {
    let table = table(kind);
    let name = text(fields, "name")
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("Untitled")
        .to_owned();
    let archived = flag(fields, "archived");
    let mut existing = id_of(db, kind, uid)?;
    let other: Option<(i64, String)> = db
        .query_row(
            &format!("SELECT id, uid FROM {table} WHERE name=?1 AND uid<>?2"),
            [&name, uid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((other, other_uid)) = other {
        if existing.is_none() && shadow(db, kind, &other_uid)?.is_none() {
            // Made on this PC under the same name before it ever synced: it is this record.
            db.execute(
                &format!("UPDATE {table} SET uid=?1 WHERE id=?2"),
                params![uid, other],
            )?;
            unmark(db, kind, &other_uid)?;
            existing = Some(other);
        } else {
            let renamed = free_name(db, kind, &name)?;
            db.execute(
                &format!("UPDATE {table} SET name=?1 WHERE id=?2"),
                params![renamed, other],
            )?;
            mark(db, kind, &other_uid)?;
        }
    }
    if kind == "project" {
        match existing {
            Some(id) => db.execute(
                "UPDATE projects SET name=?1, archived=?2 WHERE id=?3",
                params![name, archived, id],
            )?,
            None => db.execute(
                "INSERT INTO projects(uid, name, archived) VALUES (?1, ?2, ?3)",
                params![uid, name, archived],
            )?,
        };
        return Ok(());
    }
    let current: Option<i64> = match existing {
        Some(id) => Some(db.query_row("SELECT lot FROM tags WHERE id=?1", [id], |r| r.get(0))?),
        None => None,
    };
    let next_free = |db: &Connection| -> rusqlite::Result<i64> {
        db.query_row("SELECT COALESCE(MAX(lot), -1) + 1 FROM tags", [], |r| {
            r.get(0)
        })
    };
    let lot = match number(fields, "lot").filter(|lot| *lot >= 0).or(current) {
        Some(lot) => lot,
        None => next_free(db)?,
    };
    // A district placed by the server wins; a local tag on the same lot moves aside.
    let holder: Option<(i64, String)> = db
        .query_row(
            "SELECT id, uid FROM tags WHERE lot=?1 AND id IS NOT ?2",
            params![lot, existing],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((holder, holder_uid)) = holder {
        let free = next_free(db)?;
        db.execute(
            "UPDATE tags SET lot=?1 WHERE id=?2",
            params![free, holder],
        )?;
        mark(db, "tag", &holder_uid)?;
    }
    match existing {
        Some(id) => db.execute(
            "UPDATE tags SET name=?1, archived=?2, lot=?3 WHERE id=?4",
            params![name, archived, lot, id],
        )?,
        None => db.execute(
            "INSERT INTO tags(uid, name, archived, lot) VALUES (?1, ?2, ?3, ?4)",
            params![uid, name, archived, lot],
        )?,
    };
    Ok(())
}

fn write_note(db: &Connection, uid: &str, fields: &Fields) -> Result<()> {
    let title = text(fields, "title")
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or("Untitled");
    let created = number(fields, "createdAt").unwrap_or_else(now);
    db.execute(
        "INSERT INTO notes(uid, title, body, folder, pinned, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(uid) DO UPDATE SET title=excluded.title, body=excluded.body,
        folder=excluded.folder, pinned=excluded.pinned, created_at=excluded.created_at,
        updated_at=excluded.updated_at",
        params![
            uid,
            title,
            text(fields, "body").unwrap_or(""),
            text(fields, "folder").map(str::trim).unwrap_or(""),
            flag(fields, "pinned"),
            created,
            now(),
        ],
    )?;
    Ok(())
}

fn write_task(db: &Connection, uid: &str, fields: &Fields) -> Result<bool> {
    let Some(project) = reference(db, "project", fields.get("project"))? else {
        return Ok(false);
    };
    let Some(last_tag) = reference(db, "tag", fields.get("lastTag"))? else {
        return Ok(false);
    };
    let mut tag_ids = Vec::new();
    for tag in list(fields, "tags") {
        match reference(db, "tag", Some(tag))? {
            None => return Ok(false),
            Some(Some(id)) => tag_ids.push(id),
            Some(None) => {}
        }
    }
    let existing = id_of(db, "task", uid)?;
    // An unknown previous occurrence is linked later, once it arrives.
    let previous = match text(fields, "previous") {
        Some(previous) => match id_of(db, "task", previous)? {
            Some(id) if Some(id) != existing => {
                let taken: bool = db.query_row(
                    "SELECT EXISTS(SELECT 1 FROM tasks WHERE previous_id=?1 AND id IS NOT ?2)",
                    params![id, existing],
                    |r| r.get(0),
                )?;
                (!taken).then_some(id)
            }
            _ => None,
        },
        None => None,
    };
    let title = text(fields, "title")
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .unwrap_or("Untitled task");
    let recurrence = text(fields, "recurrence").filter(|r| ["daily", "weekly", "monthly"].contains(r));
    let recurrence_day = number(fields, "recurrenceDay").filter(|day| (1..=31).contains(day));
    let status = fields.get("status").cloned().map(object).unwrap_or_default();
    let done = flag(&status, "done");
    let in_progress = !done && flag(&status, "inProgress");
    let completed_at = number(&status, "completedAt").filter(|_| done);
    let values = params![
        title,
        text(fields, "due"),
        text(fields, "notes").unwrap_or(""),
        project,
        flag(fields, "important"),
        flag(fields, "urgent"),
        recurrence,
        recurrence_day,
        previous,
        last_tag,
        done,
        in_progress,
        completed_at,
        uid,
    ];
    let id = match existing {
        Some(id) => {
            db.execute(
                "UPDATE tasks SET title=?1, due=?2, notes=?3, project_id=?4, important=?5, urgent=?6,
                recurrence=?7, recurrence_day=?8, previous_id=?9, last_tag_id=?10, done=?11,
                in_progress=?12, completed_at=?13 WHERE uid=?14",
                values,
            )?;
            id
        }
        None => {
            db.execute(
                "INSERT INTO tasks(title, due, notes, project_id, important, urgent, recurrence,
                recurrence_day, previous_id, last_tag_id, done, in_progress, completed_at, uid)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                values,
            )?;
            db.last_insert_rowid()
        }
    };
    db.execute("DELETE FROM task_tags WHERE task_id=?1", [id])?;
    for tag in tag_ids {
        db.execute(
            "INSERT OR IGNORE INTO task_tags VALUES (?1, ?2)",
            params![id, tag],
        )?;
    }
    db.execute("DELETE FROM subtasks WHERE task_id=?1", [id])?;
    for (position, subtask) in list(fields, "subtasks").iter().enumerate() {
        let subtask = object(subtask.clone());
        db.execute(
            "INSERT INTO subtasks VALUES (?1, ?2, ?3, ?4)",
            params![
                id,
                position,
                text(&subtask, "title").unwrap_or("Untitled"),
                flag(&subtask, "done")
            ],
        )?;
    }
    Ok(true)
}

fn write_session(db: &Connection, uid: &str, fields: &Fields) -> Result<bool> {
    let Some(tag) = reference(db, "tag", fields.get("tag"))? else {
        return Ok(false);
    };
    let Some(tag) = tag else {
        // Its tag is gone for good, so there is nowhere to credit it.
        return Ok(true);
    };
    let Some(task) = reference(db, "task", fields.get("task"))? else {
        return Ok(false);
    };
    let Some(project) = reference(db, "project", fields.get("project"))? else {
        return Ok(false);
    };
    let started = number(fields, "startedAt").unwrap_or(0);
    let ended = number(fields, "endedAt").unwrap_or(started).max(started);
    let existing: Option<(i64, bool)> = db
        .query_row(
            "SELECT id, ended_at IS NOT NULL FROM sessions WHERE uid=?1",
            [uid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let values = params![
        tag,
        task,
        project,
        text(fields, "activity").unwrap_or("Focus"),
        number(fields, "targetMs"),
        started,
        ended,
        uid
    ];
    let id = match existing {
        Some((_, false)) => return Ok(true),
        Some((id, true)) => {
            db.execute(
                "UPDATE sessions SET tag_id=?1, task_id=?2, project_id=?3, activity=?4, target_ms=?5,
                started_at=?6, ended_at=?7 WHERE uid=?8",
                values,
            )?;
            id
        }
        None => {
            db.execute(
                "INSERT INTO sessions(tag_id, task_id, project_id, activity, target_ms, started_at, ended_at, uid)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                values,
            )?;
            db.last_insert_rowid()
        }
    };
    db.execute("DELETE FROM intervals WHERE session_id=?1", [id])?;
    for interval in list(fields, "intervals") {
        let (Some(start), Some(end)) = (
            interval.get(0).and_then(Value::as_i64),
            interval.get(1).and_then(Value::as_i64),
        ) else {
            continue;
        };
        if end > start {
            db.execute(
                "INSERT OR IGNORE INTO intervals VALUES (?1, ?2, ?3)",
                params![id, start, end],
            )?;
        }
    }
    Ok(true)
}

/// Applies a deletion made on another PC. Tags stay so their sessions keep their credit;
/// tasks keep their sessions, as with a local delete.
fn delete_local(db: &Connection, kind: &str, uid: &str) -> Result<()> {
    let Some(id) = id_of(db, kind, uid)? else {
        return Ok(());
    };
    match kind {
        "tag" => {
            db.execute("UPDATE tags SET archived=1 WHERE id=?1", [id])?;
        }
        "project" => {
            db.execute("UPDATE tasks SET project_id=NULL WHERE project_id=?1", [id])?;
            db.execute(
                "UPDATE sessions SET project_id=NULL WHERE project_id=?1",
                [id],
            )?;
            db.execute("DELETE FROM projects WHERE id=?1", [id])?;
        }
        "task" => planner::delete_task(db, id)?,
        "note" => {
            db.execute("DELETE FROM notes WHERE id=?1", [id])?;
        }
        _ => {
            db.execute(
                "DELETE FROM sessions WHERE id=?1 AND ended_at IS NOT NULL",
                [id],
            )?;
        }
    }
    Ok(())
}

/// What this PC sent for a record, when merging the server's answer to a push.
struct Sent<'a> {
    /// The shadow with the accepted fields of the op applied.
    base: Fields,
    refused: &'a [String],
    edited: bool,
}

/// Three-way merge of the server's record into this PC, field by field, with the shadow as
/// the common ancestor. When both sides changed a field differently, the server's value is
/// applied and this PC's value is kept in `sync_conflicts` for review.
fn merge(db: &Connection, record: &Record, sent: Option<Sent<'_>>, now: i64) -> Result<()> {
    let (kind, uid) = (record.kind.as_str(), record.id.as_str());
    if !["tag", "project", "task", "session", "note"].contains(&kind) {
        return Ok(());
    }
    let shadow = shadow(db, kind, uid)?;
    if shadow
        .as_ref()
        .is_some_and(|shadow| shadow.revision >= record.revision)
    {
        return Ok(());
    }
    let local = read_local(db, kind, uid)?;

    if record.deleted {
        if let Some(mine) = &local {
            let edited = match &sent {
                Some(sent) => sent.edited,
                None => {
                    is_dirty(db, kind, uid)?
                        && shadow
                            .as_ref()
                            .is_none_or(|shadow| shadow.deleted || &shadow.fields != mine)
                }
            };
            if edited {
                conflict(db, record, "deleted", &Value::Object(mine.clone()), &Value::Null, now)?;
            }
            delete_local(db, kind, uid)?;
        }
        set_shadow(db, record)?;
        unmark(db, kind, uid)?;
        return Ok(());
    }

    let Some(mine) = local else {
        if shadow.as_ref().is_some_and(|shadow| !shadow.deleted) && is_dirty(db, kind, uid)? {
            // Deleted on this PC: the deletion is pushed next and wins.
            set_shadow(db, record)?;
            return Ok(());
        }
        if !write_local(db, kind, uid, &record.fields)? {
            return defer(db, record);
        }
        set_shadow(db, record)?;
        unmark(db, kind, uid)?;
        return Ok(());
    };

    let (base, refused) = match sent {
        Some(sent) => (sent.base, sent.refused),
        None => (
            shadow
                .filter(|shadow| !shadow.deleted)
                .map(|shadow| shadow.fields)
                .unwrap_or_default(),
            &[][..],
        ),
    };
    let keys: BTreeSet<&String> = mine.keys().chain(record.fields.keys()).collect();
    let mut merged = Fields::new();
    for key in keys {
        let null = Value::Null;
        let l = mine.get(key).unwrap_or(&null);
        let r = record.fields.get(key).unwrap_or(&null);
        let b = base.get(key).unwrap_or(&null);
        let value = if (kind == "tag" && key == "lot") || l == r {
            r
        } else if refused.contains(key) {
            conflict(db, record, key, l, r, now)?;
            r
        } else if l == b {
            r
        } else if r == b {
            l
        } else {
            conflict(db, record, key, l, r, now)?;
            r
        };
        merged.insert(key.clone(), value.clone());
    }
    if merged != mine && !write_local(db, kind, uid, &merged)? {
        return defer(db, record);
    }
    set_shadow(db, record)?;
    if merged == record.fields {
        unmark(db, kind, uid)?;
    } else {
        mark(db, kind, uid)?;
    }
    Ok(())
}

fn defer(db: &Connection, record: &Record) -> Result<()> {
    db.execute(
        "INSERT OR REPLACE INTO sync_inbox(kind, uid, record) VALUES (?1, ?2, ?3)",
        params![record.kind, record.id, serde_json::to_string(record)?],
    )?;
    Ok(())
}

/// Links recurring tasks to a previous occurrence that arrived after them.
fn link_occurrences(db: &Connection) -> Result<()> {
    for (id, previous) in collect(
        db,
        "SELECT t.id, json_extract(s.fields, '$.previous') FROM tasks t
        JOIN sync_shadow s ON s.kind='task' AND s.uid=t.uid
        WHERE t.previous_id IS NULL AND json_extract(s.fields, '$.previous') IS NOT NULL",
        [],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
    )? {
        db.execute(
            "UPDATE tasks SET previous_id=(SELECT id FROM tasks WHERE uid=?2)
            WHERE id=?1 AND EXISTS(SELECT 1 FROM tasks WHERE uid=?2 AND id<>?1)
            AND NOT EXISTS(SELECT 1 FROM tasks WHERE previous_id=(SELECT id FROM tasks WHERE uid=?2))",
            params![id, previous],
        )?;
    }
    Ok(())
}

fn muted<T>(db: &Connection, apply: impl FnOnce() -> Result<T>) -> Result<T> {
    db.execute("INSERT INTO sync_mute VALUES (1)", [])?;
    let value = apply()?;
    db.execute("DELETE FROM sync_mute", [])?;
    Ok(value)
}

fn outbox(db: &Connection) -> Result<Vec<Op>> {
    collect(
        db,
        "SELECT payload FROM sync_outbox ORDER BY seq",
        [],
        |r| r.get::<_, String>(0),
    )?
    .iter()
    .map(|payload| Ok(serde_json::from_str(payload)?))
    .collect()
}

/// Turns dirty records into operations and freezes them in the outbox, so a retry sends
/// exactly the same op ids and the server can drop the duplicates.
fn freeze(db: &Connection) -> Result<Vec<Op>> {
    let waiting = outbox(db)?;
    if !waiting.is_empty() {
        return Ok(waiting);
    }
    let dirty = collect(
        db,
        &format!(
            "SELECT kind, uid, restore FROM sync_dirty ORDER BY CASE kind WHEN 'tag' THEN 0
            WHEN 'project' THEN 1 WHEN 'task' THEN 2 WHEN 'note' THEN 4 ELSE 3 END, uid LIMIT {BATCH}"
        ),
        [],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, bool>(2)?)),
    )?;
    let mut ops = Vec::new();
    let mut bytes = 0;
    for (kind, uid, restore) in dirty {
        // Long notes go a few at a time; the rest stay dirty for the next push.
        if bytes > PUSH_BYTES {
            break;
        }
        unmark(db, &kind, &uid)?;
        let shadow = shadow(db, &kind, &uid)?;
        let (base, fields, delete) = match read_local(db, &kind, &uid)? {
            None => match &shadow {
                // Still exists here (a running session) or was never synced: nothing to send.
                _ if id_of(db, &kind, &uid)?.is_some() => continue,
                Some(shadow) if !shadow.deleted => (shadow.revision, Fields::new(), true),
                _ => continue,
            },
            Some(fields) => match &shadow {
                Some(shadow) if !shadow.deleted => {
                    let changed: Fields = fields
                        .into_iter()
                        .filter(|(key, value)| shadow.fields.get(key) != Some(value))
                        .collect();
                    if changed.is_empty() {
                        continue;
                    }
                    (shadow.revision, changed, false)
                }
                Some(shadow) => (shadow.revision, fields, false),
                None => (0, fields, false),
            },
        };
        bytes += fields.values().map(|value| value.to_string().len()).sum::<usize>();
        ops.push(Op {
            op_id: Uuid::new_v4().to_string(),
            kind,
            id: uid,
            base,
            fields,
            delete,
            restore,
        });
    }
    for (seq, op) in ops.iter().enumerate() {
        db.execute(
            "INSERT INTO sync_outbox(op_id, seq, kind, uid, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![op.op_id, seq as i64, op.kind, op.id, serde_json::to_string(op)?],
        )?;
    }
    Ok(ops)
}

/// Applies the server's answers to a push. Returns how many operations it refused. Refused
/// notes are listed in `retry`: an account service set up before notes existed refuses them,
/// and they go through once its notes migration is applied.
fn settle(
    db: &Connection,
    ops: &[Op],
    outcomes: &[Outcome],
    now: i64,
    retry: &mut Vec<String>,
) -> Result<usize> {
    let mut rejected = 0;
    for outcome in outcomes {
        let Some(op) = ops
            .iter()
            .find(|op| op.op_id.eq_ignore_ascii_case(&outcome.op_id))
        else {
            continue;
        };
        if outcome.status == "rejected" {
            rejected += 1;
            if op.kind == "note" && !op.delete {
                retry.push(op.id.clone());
            }
            continue;
        }
        let Some(record) = &outcome.record else {
            continue;
        };
        let mut base = shadow(db, &op.kind, &op.id)?
            .filter(|shadow| !shadow.deleted)
            .map(|shadow| shadow.fields)
            .unwrap_or_default();
        if !op.delete {
            for (key, value) in &op.fields {
                if !outcome.conflicts.contains(key) {
                    base.insert(key.clone(), value.clone());
                }
            }
        }
        let sent = Sent {
            base,
            refused: &outcome.conflicts,
            edited: !op.delete,
        };
        merge(db, record, Some(sent), now)?;
    }
    for op in ops {
        db.execute("DELETE FROM sync_outbox WHERE op_id=?1", [&op.op_id])?;
    }
    Ok(rejected)
}

/// Merges pulled records, and retries the ones waiting for a reference.
fn absorb(db: &Connection, records: Vec<Record>, now: i64) -> Result<()> {
    let mut latest: BTreeMap<(String, String), Record> = BTreeMap::new();
    let waiting = collect(db, "SELECT record FROM sync_inbox", [], |r| {
        r.get::<_, String>(0)
    })?;
    db.execute("DELETE FROM sync_inbox", [])?;
    let top = records.iter().map(|record| record.revision).max();
    for record in waiting
        .iter()
        .filter_map(|text| serde_json::from_str::<Record>(text).ok())
        .chain(records)
    {
        let key = (record.kind.clone(), record.id.clone());
        if latest
            .get(&key)
            .is_none_or(|known| known.revision < record.revision)
        {
            latest.insert(key, record);
        }
    }
    let mut ordered: Vec<Record> = latest.into_values().collect();
    ordered.sort_by_key(|record| (order(&record.kind), record.revision));
    for record in &ordered {
        merge(db, record, None, now)?;
    }
    link_occurrences(db)?;
    if let Some(top) = top {
        db.execute(
            "UPDATE sync_state SET cursor=MAX(cursor, ?1) WHERE id=1",
            [top],
        )?;
    }
    Ok(())
}

/// Settles a conflict. Keeping this PC's value writes it back, which marks the record for
/// the next push; for an item deleted on another PC, it brings the item back.
pub(super) fn resolve(db: &Connection, id: i64, keep_mine: bool) -> Result<()> {
    let (kind, uid, field, mine): (String, String, String, Option<String>) = db
        .query_row(
            "SELECT kind, uid, field, mine FROM sync_conflicts WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?
        .ok_or("That edit was already reviewed.")?;
    db.execute("DELETE FROM sync_conflicts WHERE id=?1", [id])?;
    if !keep_mine {
        return Ok(());
    }
    let mine: Value = serde_json::from_str(mine.as_deref().unwrap_or("null"))?;
    let missing = "This item refers to something that no longer exists, so this PC's version can't be kept.";
    if field == "deleted" {
        if !write_local(db, &kind, &uid, &object(mine))? {
            return Err(missing.into());
        }
        db.execute(
            "INSERT INTO sync_dirty(kind, uid, restore) VALUES (?1, ?2, 1)
            ON CONFLICT(kind, uid) DO UPDATE SET restore=1",
            [&kind, &uid],
        )?;
        return Ok(());
    }
    let mut fields = read_local(db, &kind, &uid)?
        .ok_or("That item no longer exists. Nothing was changed.")?;
    fields.insert(field, mine);
    if !write_local(db, &kind, &uid, &fields)? {
        return Err(missing.into());
    }
    mark(db, &kind, &uid)?;
    Ok(())
}

fn label(field: &str) -> &str {
    match field {
        "name" => "Name",
        "archived" => "Archived",
        "lot" => "District",
        "title" => "Title",
        "due" => "Due date",
        "notes" => "Notes",
        "project" => "Project",
        "important" => "Important",
        "urgent" => "Urgent",
        "recurrence" => "Repeat",
        "recurrenceDay" => "Repeat day",
        "previous" => "Previous occurrence",
        "lastTag" => "Last focus tag",
        "status" => "Status",
        "tags" => "Tags",
        "subtasks" => "Subtasks",
        "tag" => "Tag",
        "task" => "Task",
        "activity" => "Activity",
        "targetMs" => "Countdown",
        "startedAt" => "Started",
        "endedAt" => "Ended",
        "intervals" => "Focus time",
        "body" => "Text",
        "folder" => "Folder",
        "pinned" => "Pinned",
        "createdAt" => "Created",
        "deleted" => "Deleted on another PC",
        other => other,
    }
}

fn name_of(db: &Connection, kind: &str, uid: &str) -> rusqlite::Result<Option<String>> {
    let column = match kind {
        "tag" | "project" => "name",
        "task" | "note" => "title",
        _ => "activity",
    };
    db.query_row(
        &format!("SELECT {column} FROM {} WHERE uid=?1", table(kind)),
        [uid],
        |r| r.get(0),
    )
    .optional()
}

/// A conflicting value as a person would read it.
fn show(db: &Connection, zone: Tz, field: &str, value: &Value) -> rusqlite::Result<String> {
    let named = |kind: &str, value: &Value| -> rusqlite::Result<String> {
        Ok(match value.as_str() {
            Some(uid) => name_of(db, kind, uid)?.unwrap_or_else(|| "A removed item".into()),
            None => "None".into(),
        })
    };
    Ok(match (field, value) {
        (_, Value::Null) => "None".into(),
        (_, Value::Bool(yes)) => if *yes { "Yes" } else { "No" }.into(),
        ("tag" | "lastTag", _) => named("tag", value)?,
        ("project", _) => named("project", value)?,
        ("task" | "previous", _) => named("task", value)?,
        ("tags", Value::Array(tags)) if tags.is_empty() => "None".into(),
        ("tags", Value::Array(tags)) => tags
            .iter()
            .map(|tag| named("tag", tag))
            .collect::<rusqlite::Result<Vec<_>>>()?
            .join(", "),
        ("status", Value::Object(status)) => {
            if flag(status, "done") {
                "Done"
            } else if flag(status, "inProgress") {
                "In progress"
            } else {
                "To do"
            }
            .into()
        }
        ("subtasks", Value::Array(items)) if items.is_empty() => "None".into(),
        ("subtasks", Value::Array(items)) => items
            .iter()
            .map(|item| {
                let item = object(item.clone());
                format!(
                    "{}{}",
                    if flag(&item, "done") { "✓ " } else { "" },
                    text(&item, "title").unwrap_or("")
                )
            })
            .collect::<Vec<_>>()
            .join(", "),
        ("targetMs", Value::Number(ms)) => {
            format!("{} min", ms.as_i64().unwrap_or(0) / 60_000)
        }
        ("startedAt" | "endedAt" | "createdAt", Value::Number(ms)) => ms
            .as_i64()
            .and_then(DateTime::from_timestamp_millis)
            .map(|at| at.with_timezone(&zone).format("%Y-%m-%d %H:%M").to_string())
            .unwrap_or_default(),
        ("intervals", Value::Array(items)) => {
            let total: i64 = items
                .iter()
                .filter_map(|item| Some(item.get(1)?.as_i64()? - item.get(0)?.as_i64()?))
                .sum();
            format!("{} min focused", total / 60_000)
        }
        (_, Value::String(text)) => {
            let short: String = text.chars().take(120).collect();
            if short.len() < text.len() {
                format!("{short}…")
            } else {
                short
            }
        }
        (_, other) => other.to_string(),
    })
}

pub(super) fn info(db: &Connection, zone: Tz) -> Result<SyncInfo> {
    let (pending, last_synced_at, last_error) = db.query_row(
        "SELECT (SELECT COUNT(*) FROM sync_dirty) + (SELECT COUNT(*) FROM sync_outbox),
        last_synced_at, last_error FROM sync_state WHERE id=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let rows = collect(
        db,
        "SELECT id, kind, uid, field, mine, theirs, at FROM sync_conflicts ORDER BY at DESC, id DESC",
        [],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, i64>(6)?,
            ))
        },
    )?;
    let mut conflicts = Vec::new();
    for (id, kind, uid, field, mine, theirs, at) in rows {
        let parse = |text: Option<String>| -> Value {
            text.and_then(|text| serde_json::from_str(&text).ok())
                .unwrap_or(Value::Null)
        };
        let (mine, theirs) = (parse(mine), parse(theirs));
        let item = match name_of(db, &kind, &uid)? {
            Some(name) => name,
            None => ["name", "title", "activity"]
                .iter()
                .find_map(|key| mine.get(key).and_then(Value::as_str))
                .unwrap_or("An item")
                .to_owned(),
        };
        let (mine, theirs) = if field == "deleted" {
            ("Edited on this PC".into(), "Deleted on another PC".into())
        } else {
            (
                show(db, zone, &field, &mine)?,
                show(db, zone, &field, &theirs)?,
            )
        };
        conflicts.push(ConflictView {
            id,
            kind,
            item,
            field: label(&field).to_owned(),
            mine,
            theirs,
            at,
        });
    }
    let last_error: Option<String> = last_error;
    let problem = last_error.as_deref().map(|error| match error {
        OFFLINE => "offline",
        SYNC_MISSING => "setup",
        _ => "other",
    });
    Ok(SyncInfo {
        pending,
        conflicts,
        last_synced_at,
        last_error,
        problem,
        syncing: false,
    })
}

impl Store {
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Shows "Syncing…" from the moment a round is about to start.
    pub fn set_syncing(&mut self, syncing: bool) {
        self.syncing = syncing;
    }

    /// Records why a sync round couldn't start, such as being offline when the sign-in
    /// needed refreshing.
    pub fn record_sync_error(&mut self, message: &str) {
        let _ = self.db.execute(
            "UPDATE sync_state SET last_error=?1 WHERE id=1",
            [message],
        );
    }

    fn begin_sync(&mut self) -> Result<(String, Vec<Op>)> {
        self.syncing = true;
        let device = self
            .db
            .query_row("SELECT device FROM sync_state WHERE id=1", [], |r| r.get(0))?;
        Ok((device, outbox(&self.db)?))
    }

    fn cursor(&self) -> Result<i64> {
        Ok(self
            .db
            .query_row("SELECT cursor FROM sync_state WHERE id=1", [], |r| r.get(0))?)
    }

    fn freeze_ops(&mut self) -> Result<Vec<Op>> {
        let tx = self.db.transaction()?;
        let ops = freeze(&tx)?;
        tx.commit()?;
        Ok(ops)
    }

    fn settle_ops(
        &mut self,
        ops: &[Op],
        outcomes: &[Outcome],
        now: i64,
        retry: &mut Vec<String>,
    ) -> Result<usize> {
        let tx = self.db.transaction()?;
        let rejected = muted(&tx, || settle(&tx, ops, outcomes, now, retry))?;
        tx.commit()?;
        Ok(rejected)
    }

    /// Queues refused notes again for the next round.
    fn retry_notes(&mut self, uids: &[String]) -> Result<()> {
        for uid in uids {
            if id_of(&self.db, "note", uid)?.is_some() {
                mark(&self.db, "note", uid)?;
            }
        }
        Ok(())
    }

    fn absorb_records(&mut self, records: Vec<Record>, now: i64) -> Result<()> {
        let tx = self.db.transaction()?;
        muted(&tx, || absorb(&tx, records, now))?;
        tx.commit()?;
        Ok(())
    }

    fn end_sync(&mut self, error: Option<&str>, now: i64) -> Result<()> {
        self.syncing = false;
        match error {
            None => self.db.execute(
                "UPDATE sync_state SET last_synced_at=?1, last_error=NULL WHERE id=1",
                [now],
            )?,
            Some(error) => self.db.execute(
                "UPDATE sync_state SET last_error=?1 WHERE id=1",
                [error],
            )?,
        };
        Ok(())
    }
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Runs a step against the store, unless the open workspace changed since sync started.
fn with<T>(
    store: &Mutex<Store>,
    path: &Path,
    step: impl FnOnce(&mut Store) -> Result<T>,
) -> std::result::Result<T, RemoteError> {
    let mut guard = store.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.path != path {
        return Err(RemoteError::new("The workspace changed during sync."));
    }
    step(&mut guard).map_err(|error| RemoteError::new(describe(&*error)))
}

fn round(
    store: &Mutex<Store>,
    remote: &dyn Remote,
    path: &Path,
) -> std::result::Result<usize, RemoteError> {
    let mut rejected = 0;
    let mut retry = Vec::new();
    let (device, waiting) = with(store, path, |store| store.begin_sync())?;
    if !waiting.is_empty() {
        let outcomes = remote.push(&device, &waiting)?;
        rejected += with(store, path, |store| {
            store.settle_ops(&waiting, &outcomes, now(), &mut retry)
        })?;
    }
    loop {
        let cursor = with(store, path, |store| store.cursor())?;
        let page = remote.pull(cursor, PAGE)?;
        let full = page.len() >= PAGE;
        with(store, path, |store| store.absorb_records(page, now()))?;
        if !full {
            break;
        }
    }
    // Each answer may leave edits made meanwhile; a bounded loop sends those too.
    for _ in 0..50 {
        let ops = with(store, path, |store| store.freeze_ops())?;
        if ops.is_empty() {
            break;
        }
        let outcomes = remote.push(&device, &ops)?;
        rejected += with(store, path, |store| {
            store.settle_ops(&ops, &outcomes, now(), &mut retry)
        })?;
    }
    if !retry.is_empty() {
        with(store, path, |store| store.retry_notes(&retry))?;
    }
    Ok(rejected)
}

/// One sync round for the workspace at `path`. Everything stays pending on failure, and
/// the next round retries.
pub fn run(
    store: &Mutex<Store>,
    remote: &dyn Remote,
    path: &Path,
) -> std::result::Result<(), RemoteError> {
    let result = round(store, remote, path);
    let message = match &result {
        Ok(0) => None,
        Ok(_) => Some(
            "Some changes couldn't be synced because the account service refused them.".to_owned(),
        ),
        Err(error) => Some(error.message.clone()),
    };
    let mut guard = store.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.path == path {
        let _ = guard.end_sync(message.as_deref(), now());
    }
    result.map(drop)
}

#[cfg(test)]
mod tests {
    use super::super::{Action, Store, MINUTE};
    use super::*;
    use crate::store::planner::{Status, TaskDraft};
    use std::{cell::RefCell, collections::HashMap};

    /// An in-memory account service following the same rules as `ada_push`.
    #[derive(Default)]
    struct Server {
        state: RefCell<ServerState>,
        /// When set, the next push is applied but its answer is lost.
        drop_answer: RefCell<bool>,
        /// Refuses notes, like an account service set up before notes existed.
        refuse_notes: RefCell<bool>,
    }

    #[derive(Default)]
    struct ServerState {
        revision: i64,
        records: HashMap<(String, String), (Fields, HashMap<String, (i64, String)>, bool, i64)>,
        ops: HashMap<String, Outcome>,
        pushes: usize,
    }

    impl ServerState {
        fn record(&self, kind: &str, id: &str) -> Option<Record> {
            self.records
                .get(&(kind.to_owned(), id.to_owned()))
                .map(|(fields, _, deleted, revision)| Record {
                    kind: kind.into(),
                    id: id.into(),
                    fields: fields.clone(),
                    deleted: *deleted,
                    revision: *revision,
                })
        }

        fn name_taken(&self, kind: &str, id: &str, name: &str) -> bool {
            self.records.iter().any(|((k, i), (fields, _, deleted, _))| {
                k == kind
                    && i != id
                    && !deleted
                    && text(fields, "name").is_some_and(|n| n.to_lowercase() == name.to_lowercase())
            })
        }

        fn apply(&mut self, device: &str, op: &Op) -> Outcome {
            if let Some(outcome) = self.ops.get(&op.op_id) {
                return outcome.clone();
            }
            let key = (op.kind.clone(), op.id.clone());
            let mut status = "applied";
            let mut conflicts = Vec::new();
            match self.records.get(&key).cloned() {
                Some((_, _, true, _)) if !op.restore => {
                    if !op.delete {
                        status = "deleted";
                    }
                }
                found if op.delete => {
                    if found.is_some() {
                        self.revision += 1;
                        self.records
                            .insert(key.clone(), (Fields::new(), HashMap::new(), true, self.revision));
                    }
                }
                None | Some((_, _, true, _)) => {
                    self.revision += 1;
                    let mut fields = op.fields.clone();
                    if let Some(name) = text(&op.fields, "name").map(str::to_owned) {
                        let mut n = 1;
                        while self.name_taken(&op.kind, &op.id, text(&fields, "name").unwrap()) {
                            n += 1;
                            fields.insert("name".into(), json!(format!("{name} ({n})")));
                        }
                        if n > 1 {
                            conflicts.push("name".to_owned());
                        }
                    }
                    if op.kind == "tag" {
                        let lots: Vec<i64> = self
                            .records
                            .iter()
                            .filter(|((k, i), (_, _, deleted, _))| k == "tag" && i != &op.id && !deleted)
                            .filter_map(|(_, (fields, _, _, _))| number(fields, "lot"))
                            .collect();
                        let lot = number(&fields, "lot")
                            .filter(|lot| *lot >= 0 && !lots.contains(lot))
                            .unwrap_or_else(|| lots.iter().max().map_or(0, |max| max + 1));
                        fields.insert("lot".into(), json!(lot));
                    }
                    let meta = fields
                        .keys()
                        .map(|key| (key.clone(), (self.revision, device.to_owned())))
                        .collect();
                    self.records
                        .insert(key.clone(), (fields, meta, false, self.revision));
                    if !conflicts.is_empty() {
                        status = "conflict";
                    }
                }
                Some((mut fields, mut meta, false, revision)) => {
                    let mut changed = false;
                    for (field, value) in &op.fields {
                        if fields.get(field) == Some(value) || (op.kind == "tag" && field == "lot") {
                            continue;
                        }
                        if meta
                            .get(field)
                            .is_some_and(|(r, d)| *r > op.base && d != device)
                            || (field == "name"
                                && self.name_taken(&op.kind, &op.id, value.as_str().unwrap_or("")))
                        {
                            conflicts.push(field.clone());
                            continue;
                        }
                        fields.insert(field.clone(), value.clone());
                        meta.insert(field.clone(), (self.revision + 1, device.to_owned()));
                        changed = true;
                    }
                    let revision = if changed {
                        self.revision += 1;
                        self.revision
                    } else {
                        revision
                    };
                    self.records.insert(key.clone(), (fields, meta, false, revision));
                    if !conflicts.is_empty() {
                        status = "conflict";
                    }
                }
            }
            let outcome = Outcome {
                op_id: op.op_id.clone(),
                status: status.into(),
                conflicts,
                record: self.record(&op.kind, &op.id),
            };
            self.ops.insert(op.op_id.clone(), outcome.clone());
            outcome
        }
    }

    impl Remote for Server {
        fn push(&self, device: &str, ops: &[Op]) -> std::result::Result<Vec<Outcome>, RemoteError> {
            let mut state = self.state.borrow_mut();
            state.pushes += 1;
            let refuse = *self.refuse_notes.borrow();
            let outcomes = ops
                .iter()
                .map(|op| {
                    if refuse && op.kind == "note" {
                        Outcome {
                            op_id: op.op_id.clone(),
                            status: "rejected".into(),
                            conflicts: Vec::new(),
                            record: None,
                        }
                    } else {
                        state.apply(device, op)
                    }
                })
                .collect();
            if self.drop_answer.replace(false) {
                return Err(RemoteError::new("The connection dropped."));
            }
            Ok(outcomes)
        }

        fn pull(&self, since: i64, limit: usize) -> std::result::Result<Vec<Record>, RemoteError> {
            let state = self.state.borrow();
            let mut records: Vec<Record> = state
                .records
                .keys()
                .filter_map(|(kind, id)| state.record(kind, id))
                .filter(|record| record.revision > since)
                .collect();
            records.sort_by_key(|record| record.revision);
            records.truncate(limit);
            Ok(records)
        }
    }

    const NOW: i64 = 1_800_000_000_000;

    fn pc() -> Mutex<Store> {
        Mutex::new(Store::open_in_zone(":memory:", false, chrono_tz::UTC, NOW).unwrap())
    }

    fn act(pc: &Mutex<Store>, action: Action) -> super::super::Snapshot {
        pc.lock().unwrap().apply_at(action, NOW).unwrap()
    }

    fn sync(pc: &Mutex<Store>, server: &Server) {
        run(pc, server, Path::new(":memory:")).unwrap();
    }

    fn tag(pc: &Mutex<Store>, name: &str) -> i64 {
        act(pc, Action::AddTag { name: name.into() })
            .tags
            .iter()
            .find(|tag| tag.name == name)
            .unwrap()
            .id
    }

    fn draft(title: &str, tag: i64) -> TaskDraft {
        note(title, tag, "", None)
    }

    fn note(title: &str, tag: i64, notes: &str, recurrence: Option<&str>) -> TaskDraft {
        serde_json::from_value(json!({
            "title": title, "due": "2027-01-15", "notes": notes, "projectId": null,
            "important": false, "urgent": false, "recurrence": recurrence,
            "tagIds": [tag], "newTags": [], "subtasks": []
        }))
        .unwrap()
    }

    fn task_id(pc: &Mutex<Store>, title: &str) -> i64 {
        act(pc, Action::Read)
            .tasks
            .iter()
            .find(|task| task.title == title)
            .unwrap()
            .id
    }

    fn focus(pc: &Mutex<Store>, tag_id: i64, minutes: i64) {
        let mut store = pc.lock().unwrap();
        let id = store
            .apply_at(
                Action::Start {
                    task_id: None,
                    tag_id,
                    target_ms: None,
                },
                NOW,
            )
            .unwrap()
            .active
            .unwrap()
            .id;
        store
            .apply_at(Action::Finish { id }, NOW + minutes * MINUTE)
            .unwrap();
    }

    /// Each district's name, placement, and credited minutes.
    fn town(pc: &Mutex<Store>) -> Vec<(String, i64, i64)> {
        let mut town: Vec<_> = act(pc, Action::Read)
            .tags
            .iter()
            .map(|tag| (tag.name.clone(), tag.lot, tag.total_ms / MINUTE))
            .collect();
        town.sort();
        town
    }

    fn conflicts(pc: &Mutex<Store>) -> Vec<(i64, String)> {
        let store = pc.lock().unwrap();
        info(&store.db, chrono_tz::UTC)
            .unwrap()
            .conflicts
            .iter()
            .map(|c| (c.id, c.field.clone()))
            .collect()
    }

    #[test]
    fn a_retried_push_is_applied_once() {
        let server = Server::default();
        let a = pc();
        let reading = tag(&a, "Reading");
        focus(&a, reading, 25);
        *server.drop_answer.borrow_mut() = true;
        assert!(run(&a, &server, Path::new(":memory:")).is_err());
        let pending: i64 = a
            .lock()
            .unwrap()
            .db
            .query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert!(pending > 0, "unanswered ops stay frozen for the retry");
        sync(&a, &server);
        let sessions = server
            .state
            .borrow()
            .records
            .keys()
            .filter(|(kind, _)| kind == "session")
            .count();
        assert_eq!(sessions, 1);

        let b = pc();
        sync(&b, &server);
        assert_eq!(town(&b), vec![("Reading".into(), 0, 25)]);
        assert_eq!(town(&a), town(&b));
        assert_eq!(act(&b, Action::Read).sessions.len(), 1);
    }

    #[test]
    fn independent_edits_survive_and_the_same_field_conflicts() {
        let server = Server::default();
        let (a, b) = (pc(), pc());
        let reading = tag(&a, "Reading");
        act(
            &a,
            Action::SaveTask {
                id: None,
                draft: draft("Read chapter four", reading),
            },
        );
        sync(&a, &server);
        sync(&b, &server);
        let (on_a, on_b) = (task_id(&a, "Read chapter four"), task_id(&b, "Read chapter four"));
        let reading_b = act(&b, Action::Read).tags[0].id;

        act(&a, Action::SaveTask { id: Some(on_a), draft: draft("Read chapter five", reading) });
        let notes = note("Read chapter four", reading_b, "Bring the blue notebook", None);
        act(&b, Action::SaveTask { id: Some(on_b), draft: notes });
        sync(&a, &server);
        sync(&b, &server);
        sync(&a, &server);
        for pc in [&a, &b] {
            let task = act(pc, Action::Read).tasks.into_iter().next().unwrap();
            assert_eq!(task.title, "Read chapter five");
            assert_eq!(task.notes, "Bring the blue notebook");
        }
        assert!(conflicts(&a).is_empty() && conflicts(&b).is_empty());

        // Both PCs rename the task: the first to sync wins, the other keeps its title for review.
        let edit = note("Title from A", reading, "Bring the blue notebook", None);
        act(&a, Action::SaveTask { id: Some(on_a), draft: edit });
        let other = note("Title from B", reading_b, "Bring the blue notebook", None);
        act(&b, Action::SaveTask { id: Some(on_b), draft: other });
        sync(&a, &server);
        sync(&b, &server);
        assert_eq!(act(&b, Action::Read).tasks[0].title, "Title from A");
        let review = conflicts(&b);
        assert_eq!(review.len(), 1);
        assert_eq!(review[0].1, "Title");
        let view = &info(&b.lock().unwrap().db, chrono_tz::UTC).unwrap().conflicts[0];
        assert_eq!((view.mine.as_str(), view.theirs.as_str()), ("Title from B", "Title from A"));

        act(&b, Action::ResolveConflict { id: review[0].0, keep_mine: true });
        sync(&b, &server);
        sync(&a, &server);
        assert_eq!(act(&a, Action::Read).tasks[0].title, "Title from B");
        assert!(conflicts(&b).is_empty());
    }

    #[test]
    fn deletion_wins_and_an_edit_can_bring_the_item_back() {
        let server = Server::default();
        let (a, b) = (pc(), pc());
        let reading = tag(&a, "Reading");
        act(&a, Action::SaveTask { id: None, draft: draft("Plan the week", reading) });
        sync(&a, &server);
        sync(&b, &server);
        act(&a, Action::DeleteTask { id: task_id(&a, "Plan the week") });
        let on_b = task_id(&b, "Plan the week");
        act(&b, Action::Complete { id: on_b, done: true });
        sync(&a, &server);
        sync(&b, &server);
        assert!(act(&b, Action::Read).tasks.is_empty(), "deletion wins over the edit");
        let review = conflicts(&b);
        assert_eq!(review.len(), 1);
        assert_eq!(review[0].1, "Deleted on another PC");

        act(&b, Action::ResolveConflict { id: review[0].0, keep_mine: true });
        sync(&b, &server);
        sync(&a, &server);
        let back = act(&a, Action::Read).tasks;
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].title, "Plan the week");
        assert!(matches!(back[0].status, Status::Done));
    }

    #[test]
    fn the_same_tag_made_on_two_pcs_is_one_district() {
        let server = Server::default();
        let (a, b) = (pc(), pc());
        let design = tag(&a, "Design");
        let reading_a = tag(&a, "Reading");
        let reading_b = tag(&b, "reading");
        let writing = tag(&b, "Writing");
        focus(&a, reading_a, 30);
        focus(&a, design, 10);
        focus(&b, reading_b, 20);
        focus(&b, writing, 5);
        sync(&a, &server);
        sync(&b, &server);
        sync(&a, &server);
        let shared = town(&a);
        assert_eq!(shared, town(&b));
        assert_eq!(shared.len(), 3, "{shared:?}");
        assert_eq!(shared[1].0, "Reading");
        assert_eq!(shared[1].2, 50);
        let lots: BTreeSet<i64> = shared.iter().map(|tag| tag.1).collect();
        assert_eq!(lots.len(), 3, "every district keeps its own lot");
    }

    #[test]
    fn a_recurring_task_completed_on_two_pcs_repeats_once() {
        let server = Server::default();
        let (a, b) = (pc(), pc());
        let reading = tag(&a, "Reading");
        let weekly = note("Water the plants", reading, "", Some("weekly"));
        act(&a, Action::SaveTask { id: None, draft: weekly });
        sync(&a, &server);
        sync(&b, &server);
        let (on_a, on_b) = (task_id(&a, "Water the plants"), task_id(&b, "Water the plants"));
        act(&a, Action::Complete { id: on_a, done: true });
        act(&b, Action::Complete { id: on_b, done: true });
        sync(&a, &server);
        sync(&b, &server);
        sync(&a, &server);
        for pc in [&a, &b] {
            let tasks = act(pc, Action::Read).tasks;
            assert_eq!(tasks.len(), 2, "one done occurrence and one next occurrence");
            assert_eq!(tasks.iter().filter(|task| task.done).count(), 1);
            assert!(tasks.iter().any(|task| task.previous_id.is_some()));
        }
        assert!(conflicts(&a).is_empty() && conflicts(&b).is_empty());
    }

    #[test]
    fn upgrading_a_workspace_gives_every_record_an_id_and_queues_it() {
        let path = std::env::temp_dir().join(format!("ada-sync-{}.sqlite3", Uuid::new_v4()));
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch(include_str!("../schema.sql")).unwrap();
            db.execute_batch(include_str!("../planner.sql")).unwrap();
            db.execute_batch(include_str!("../catalog.sql")).unwrap();
            db.execute_batch(
                "PRAGMA user_version=3;
                INSERT INTO tags(name, lot) VALUES ('Reading', 0), ('Design', 1);
                INSERT INTO projects(name) VALUES ('Studio');
                INSERT INTO tasks(title) VALUES ('One'), ('Two');
                INSERT INTO sessions(tag_id, activity, started_at, ended_at) VALUES (1, 'Read', 0, 60000);
                INSERT INTO intervals VALUES (1, 0, 60000);
                INSERT INTO sessions(tag_id, activity, started_at) VALUES (2, 'Running', 70000);",
            )
            .unwrap();
        }
        let store = Store::open_in_zone(&path, false, chrono_tz::UTC, NOW).unwrap();
        let count = |sql: &str| -> i64 { store.db.query_row(sql, [], |r| r.get(0)).unwrap() };
        assert_eq!(count("PRAGMA user_version"), 6);
        for table in ["tags", "projects", "tasks", "sessions"] {
            assert_eq!(count(&format!("SELECT COUNT(*) FROM {table} WHERE uid IS NULL")), 0);
        }
        assert_eq!(
            store
                .db
                .query_row("SELECT uid FROM tags WHERE name='Reading'", [], |r| r.get::<_, String>(0))
                .unwrap(),
            uuid(Some("tag"), Some("Reading"))
        );
        // Two tags, one project, two tasks, and the finished session; the running one waits.
        assert_eq!(count("SELECT COUNT(*) FROM sync_dirty"), 6);
        drop(store);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn two_pcs_reach_the_same_town() {
        let server = Server::default();
        let (a, b) = (pc(), pc());
        let reading = tag(&a, "Reading");
        focus(&a, reading, 15);
        sync(&a, &server);
        sync(&b, &server);
        let reading_b = act(&b, Action::Read).tags[0].id;
        focus(&b, reading_b, 45);
        let walking = tag(&b, "Walking");
        focus(&b, walking, 70);
        focus(&a, reading, 5);
        sync(&b, &server);
        sync(&a, &server);
        sync(&b, &server);
        assert_eq!(town(&a), town(&b));
        assert_eq!(town(&a)[0], ("Reading".into(), 0, 65));
        let (sa, sb) = (act(&a, Action::Read), act(&b, Action::Read));
        assert_eq!(sa.sessions.len(), 4);
        assert_eq!(sb.sessions.len(), 4);
        let pending = |pc: &Mutex<Store>| -> i64 {
            pc.lock()
                .unwrap()
                .db
                .query_row("SELECT COUNT(*) FROM sync_dirty", [], |r| r.get(0))
                .unwrap()
        };
        assert_eq!((pending(&a), pending(&b)), (0, 0));
        assert!(server.state.borrow().pushes > 0);
    }

    fn note_body(pc: &Mutex<Store>, title: &str) -> (i64, String) {
        let snapshot = act(pc, Action::Read);
        let id = snapshot.notes.iter().find(|n| n.title == title).unwrap().id;
        (id, pc.lock().unwrap().note(id).unwrap().body)
    }

    #[test]
    fn notes_sync_and_wait_for_an_older_account_service() {
        let server = Server::default();
        let (a, b) = (pc(), pc());
        *server.refuse_notes.borrow_mut() = true;
        act(
            &a,
            Action::CreateNote {
                uid: Uuid::new_v4().to_string(),
                title: "Ideas".into(),
                folder: "Projects/ Ada".into(),
                body: "See [[Daily]] #plans".into(),
            },
        );
        assert!(run(&a, &server, Path::new(":memory:")).is_ok());
        assert_eq!(server.state.borrow().records.len(), 0);
        let error: Option<String> = a
            .lock()
            .unwrap()
            .db
            .query_row("SELECT last_error FROM sync_state", [], |r| r.get(0))
            .unwrap();
        assert!(error.is_some(), "a refused note is reported");

        // Once the service knows notes, the waiting note goes through.
        *server.refuse_notes.borrow_mut() = false;
        sync(&a, &server);
        sync(&b, &server);
        let (on_b, body) = note_body(&b, "Ideas");
        assert_eq!(body, "See [[Daily]] #plans");
        let meta = act(&b, Action::Read);
        let ideas = meta.notes.iter().find(|n| n.id == on_b).unwrap();
        assert_eq!(ideas.folder, "Projects/Ada");
        assert_eq!(ideas.links, vec!["daily"]);

        // Different fields merge; the same field conflicts and keeps this PC's text for review.
        let (on_a, _) = note_body(&a, "Ideas");
        act(&a, Action::SaveNote { id: on_a, body: "From A".into() });
        act(&b, Action::PinNote { id: on_b, pinned: true });
        sync(&a, &server);
        sync(&b, &server);
        sync(&a, &server);
        assert_eq!(note_body(&b, "Ideas").1, "From A");
        act(&a, Action::SaveNote { id: on_a, body: "A again".into() });
        act(&b, Action::SaveNote { id: on_b, body: "B instead".into() });
        sync(&a, &server);
        sync(&b, &server);
        assert_eq!(note_body(&b, "Ideas").1, "A again");
        let review = conflicts(&b);
        assert_eq!(review.len(), 1);
        assert_eq!(review[0].1, "Text");

        // The same day's daily note made on both PCs is one note.
        act(&a, Action::DailyNote);
        act(&b, Action::DailyNote);
        sync(&a, &server);
        sync(&b, &server);
        sync(&a, &server);
        for pc in [&a, &b] {
            let daily = act(pc, Action::Read)
                .notes
                .iter()
                .filter(|n| n.folder == "Daily")
                .count();
            assert_eq!(daily, 1);
        }

        act(&a, Action::DeleteNote { id: on_a });
        sync(&a, &server);
        sync(&b, &server);
        assert!(act(&b, Action::Read).notes.iter().all(|n| n.title != "Ideas"));
    }
}
