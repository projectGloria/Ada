//! Markdown notes: a flat list of notes grouped by folder path ("Projects/Ada"), linked
//! to each other with [[wikilinks]] and labelled with #tags. Bodies stay out of the
//! snapshot; the editor asks for one note's body at a time.

use super::{collect, text, Result};
use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::BTreeSet;

/// Bytes, so a pushed note stays well under the account service's limit.
const BODY_LIMIT: usize = 1_000_000;
const DAILY: &str = "Daily";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub(super) id: i64,
    uid: String,
    pub(super) title: String,
    pub(super) folder: String,
    pinned: bool,
    created_at: i64,
    updated_at: i64,
    excerpt: String,
    words: usize,
    /// Lowercased titles this note links to.
    pub(super) links: Vec<String>,
    /// Lowercased tags without the #.
    tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteBody {
    id: i64,
    pub(super) body: String,
    updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHit {
    id: i64,
    title: String,
    folder: String,
    snippet: String,
}

fn title(value: &str) -> Result<String> {
    let value = text(value, "Note title", 200)?;
    if value.contains(['[', ']', '|', '#', '^']) {
        return Err("Note titles can't contain [ ] | # or ^, because links use them.".into());
    }
    Ok(value)
}

fn folder(value: &str) -> Result<String> {
    let parts: Vec<&str> = value
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    let joined = parts.join("/");
    if joined.chars().count() > 200 {
        return Err("Folder paths can be up to 200 characters.".into());
    }
    Ok(joined)
}

fn body(value: String) -> Result<String> {
    if value.len() > BODY_LIMIT {
        return Err("This note is too long. Split it into a few smaller notes.".into());
    }
    Ok(value)
}

fn require(db: &Connection, id: i64) -> Result<String> {
    db.query_row("SELECT title FROM notes WHERE id=?1", [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| "That note no longer exists.".into())
}

fn taken(db: &Connection, title: &str, except: Option<i64>) -> rusqlite::Result<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM notes WHERE title=?1 COLLATE NOCASE AND id IS NOT ?2)",
        params![title, except],
        |r| r.get(0),
    )
}

/// "Untitled", then "Untitled 2", "Untitled 3"…
fn free_title(db: &Connection, title: &str) -> rusqlite::Result<String> {
    if !taken(db, title, None)? {
        return Ok(title.to_owned());
    }
    let mut n = 2;
    loop {
        let candidate = format!("{title} {n}");
        if !taken(db, &candidate, None)? {
            return Ok(candidate);
        }
        n += 1;
    }
}

pub(super) fn create(
    db: &Connection,
    uid: &str,
    name: &str,
    folder_path: &str,
    text_body: String,
    now: i64,
) -> Result<()> {
    if uuid::Uuid::parse_str(uid).is_err() {
        return Err("Ada could not create that note.".into());
    }
    let name = free_title(db, &title(name)?)?;
    db.execute(
        "INSERT INTO notes(uid, title, body, folder, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![uid, name, body(text_body)?, folder(folder_path)?, now],
    )?;
    Ok(())
}

pub(super) fn save(db: &Connection, id: i64, text_body: String, now: i64) -> Result<()> {
    require(db, id)?;
    db.execute(
        "UPDATE notes SET body=?2, updated_at=?3 WHERE id=?1 AND body IS NOT ?2",
        params![id, body(text_body)?, now],
    )?;
    Ok(())
}

/// Renames a note and rewrites [[links]] to it in every other note.
pub(super) fn rename(db: &Connection, id: i64, name: &str, now: i64) -> Result<()> {
    let old = require(db, id)?;
    let name = title(name)?;
    if name == old {
        return Ok(());
    }
    if taken(db, &name, Some(id))? {
        return Err("Another note already has that title.".into());
    }
    db.execute(
        "UPDATE notes SET title=?2, updated_at=?3 WHERE id=?1",
        params![id, name, now],
    )?;
    for (other, text_body) in collect(
        db,
        "SELECT id, body FROM notes WHERE instr(lower(body), lower(?1)) > 0",
        [format!("[[{old}")],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
    )? {
        let rewritten = rewrite_links(&text_body, &old, &name);
        if rewritten != text_body {
            db.execute(
                "UPDATE notes SET body=?2, updated_at=?3 WHERE id=?1",
                params![other, rewritten, now],
            )?;
        }
    }
    Ok(())
}

pub(super) fn move_to(db: &Connection, id: i64, folder_path: &str, now: i64) -> Result<()> {
    require(db, id)?;
    db.execute(
        "UPDATE notes SET folder=?2, updated_at=?3 WHERE id=?1 AND folder IS NOT ?2",
        params![id, folder(folder_path)?, now],
    )?;
    Ok(())
}

pub(super) fn pin(db: &Connection, id: i64, pinned: bool) -> Result<()> {
    require(db, id)?;
    db.execute(
        "UPDATE notes SET pinned=?2 WHERE id=?1 AND pinned IS NOT ?2",
        params![id, pinned],
    )?;
    Ok(())
}

pub(super) fn delete(db: &Connection, id: i64) -> Result<()> {
    require(db, id)?;
    db.execute("DELETE FROM notes WHERE id=?1", [id])?;
    Ok(())
}

pub(super) fn folders(db: &Connection) -> Result<Vec<String>> {
    let mut set = BTreeSet::new();
    for path in collect(db, "SELECT path FROM note_folders", [], |r| {
        r.get::<_, String>(0)
    })?
    .into_iter()
    .chain(collect(
        db,
        "SELECT DISTINCT folder FROM notes WHERE folder <> ''",
        [],
        |r| r.get::<_, String>(0),
    )?) {
        let mut walked = String::new();
        for part in path.split('/').filter(|p| !p.is_empty()) {
            if !walked.is_empty() {
                walked.push('/');
            }
            walked.push_str(part);
            set.insert(walked.clone());
        }
    }
    Ok(set.into_iter().collect())
}

pub(super) fn create_folder(db: &Connection, path: &str) -> Result<()> {
    let path = folder(path)?;
    if path.is_empty() {
        return Err("Folder name can't be empty.".into());
    }
    db.execute(
        "INSERT OR IGNORE INTO note_folders(path) VALUES (?1)",
        [path],
    )?;
    Ok(())
}

/// Moves a folder, with its subfolders, to a new path. An empty path moves its notes to
/// the top level.
pub(super) fn rename_folder(db: &Connection, from: &str, to: &str, now: i64) -> Result<()> {
    let from = folder(from)?;
    let to = folder(to)?;
    if from.is_empty() {
        return Err("Choose a folder to rename.".into());
    }
    if to == from || to.starts_with(&format!("{from}/")) {
        return Err("A folder can't move inside itself.".into());
    }
    db.execute(
        "UPDATE notes SET folder = CASE
            WHEN folder = ?1 THEN ?2
            WHEN ?2 = '' THEN substr(folder, length(?1) + 2)
            ELSE ?2 || substr(folder, length(?1) + 1) END,
        updated_at=?3
        WHERE folder = ?1 OR substr(folder, 1, length(?1) + 1) = ?1 || '/'",
        params![from, to, now],
    )?;
    let existing = collect(
        db,
        "SELECT path FROM note_folders WHERE path = ?1 OR substr(path, 1, length(?1) + 1) = ?1 || '/'",
        [&from],
        |r| r.get::<_, String>(0),
    )?;
    db.execute(
        "DELETE FROM note_folders WHERE path = ?1 OR substr(path, 1, length(?1) + 1) = ?1 || '/'",
        [&from],
    )?;
    for old_path in existing {
        let new_path = if old_path == from {
            to.clone()
        } else if to.is_empty() {
            old_path[from.len() + 1..].to_owned()
        } else {
            format!("{to}{}", &old_path[from.len()..])
        };
        if !new_path.is_empty() {
            db.execute(
                "INSERT OR IGNORE INTO note_folders(path) VALUES (?1)",
                [new_path],
            )?;
        }
    }
    if !to.is_empty() {
        db.execute("INSERT OR IGNORE INTO note_folders(path) VALUES (?1)", [to])?;
    }
    Ok(())
}

pub(super) fn delete_folder(db: &Connection, path: &str) -> Result<()> {
    let path = folder(path)?;
    if path.is_empty() {
        return Err("Choose a folder to delete.".into());
    }
    db.execute(
        "DELETE FROM notes WHERE folder = ?1 OR substr(folder, 1, length(?1) + 1) = ?1 || '/'",
        [&path],
    )?;
    db.execute(
        "DELETE FROM note_folders WHERE path = ?1 OR substr(path, 1, length(?1) + 1) = ?1 || '/'",
        [&path],
    )?;
    Ok(())
}

/// Opens today's daily note, creating it on first use. Its uid comes from the date, so the
/// same day's note made on two PCs syncs as one note.
pub(super) fn daily(db: &Connection, today: NaiveDate, now: i64) -> Result<()> {
    let date = today.to_string();
    let uid = super::sync::uuid(Some("daily"), Some(&date));
    let exists: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM notes WHERE uid=?1)",
        [&uid],
        |r| r.get(0),
    )?;
    if !exists {
        let name = free_title(db, &date)?;
        let heading = today.format("%A, %B %-d, %Y");
        db.execute(
            "INSERT INTO notes(uid, title, body, folder, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![uid, name, format!("# {heading}\n\n"), DAILY, now],
        )?;
    }
    Ok(())
}

pub fn body_of(db: &Connection, id: i64) -> Result<NoteBody> {
    db.query_row(
        "SELECT id, body, updated_at FROM notes WHERE id=?1",
        [id],
        |r| {
            Ok(NoteBody {
                id: r.get(0)?,
                body: r.get(1)?,
                updated_at: r.get(2)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| "That note no longer exists.".into())
}

/// Every note whose title or text contains the query, titles first.
pub fn search(db: &Connection, query: &str) -> Result<Vec<NoteHit>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let rows = collect(
        db,
        "SELECT id, title, folder, body, instr(lower(title), lower(?1)) > 0 AS in_title
        FROM notes WHERE instr(lower(title), lower(?1)) > 0 OR instr(lower(body), lower(?1)) > 0
        ORDER BY in_title DESC, updated_at DESC LIMIT 50",
        [query],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        },
    )?;
    Ok(rows
        .into_iter()
        .map(|(id, title, folder, text_body)| NoteHit {
            id,
            title,
            folder,
            snippet: snippet(&text_body, query),
        })
        .collect())
}

/// A line of context around the first match.
fn snippet(text_body: &str, query: &str) -> String {
    let lower = text_body.to_lowercase();
    let Some(at) = lower.find(&query.to_lowercase()) else {
        return excerpt(text_body);
    };
    // Lowercasing can shift byte offsets; map back by characters.
    let at_char = lower[..at].chars().count();
    let chars: Vec<char> = text_body.chars().collect();
    let start = at_char.saturating_sub(50);
    let end = (at_char + query.chars().count() + 90).min(chars.len());
    let piece: String = chars[start.min(chars.len())..end]
        .iter()
        .map(|c| if c.is_whitespace() { ' ' } else { *c })
        .collect();
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        piece.trim(),
        if end < chars.len() { "…" } else { "" }
    )
}

pub(super) fn notes(db: &Connection) -> Result<Vec<NoteMeta>> {
    Ok(collect(
        db,
        "SELECT id, uid, title, folder, pinned, created_at, updated_at, body FROM notes
        ORDER BY pinned DESC, updated_at DESC, id DESC",
        [],
        |r| {
            let text_body: String = r.get(7)?;
            let (links, tags) = references(&text_body);
            Ok(NoteMeta {
                id: r.get(0)?,
                uid: r.get(1)?,
                title: r.get(2)?,
                folder: r.get(3)?,
                pinned: r.get(4)?,
                created_at: r.get(5)?,
                updated_at: r.get(6)?,
                excerpt: excerpt(&text_body),
                words: text_body.split_whitespace().count(),
                links,
                tags,
            })
        },
    )?)
}

/// The body without frontmatter, fenced code, or markdown punctuation, cut short.
fn excerpt(text_body: &str) -> String {
    let mut out = String::new();
    for line in prose_lines(text_body) {
        let line = line
            .trim()
            .trim_start_matches(['#', '>', '-', '*', '+', ' '])
            .trim_start_matches("[ ] ")
            .trim_start_matches("[x] ");
        if line.is_empty() || line.chars().all(|c| "-*_=|:".contains(c)) {
            continue;
        }
        let cleaned: String = line
            .replace("[[", "")
            .replace("]]", "")
            .replace("**", "")
            .replace("==", "")
            .replace('`', "");
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(&cleaned);
        if out.chars().count() > 160 {
            break;
        }
    }
    let short: String = out.chars().take(160).collect();
    if short.len() < out.len() {
        format!("{short}…")
    } else {
        short
    }
}

/// Lines outside frontmatter and fenced code blocks.
fn prose_lines(text_body: &str) -> impl Iterator<Item = &str> {
    let mut lines = text_body.lines().peekable();
    let mut frontmatter = lines.peek().is_some_and(|line| line.trim() == "---");
    let mut first = true;
    let mut fence = false;
    lines.filter(move |line| {
        let trimmed = line.trim_start();
        if frontmatter {
            if !first && trimmed.trim_end() == "---" {
                frontmatter = false;
            }
            first = false;
            return false;
        }
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fence = !fence;
            return false;
        }
        !fence
    })
}

/// Link targets and tags in a body, lowercased and without duplicates. Inline code is
/// skipped; frontmatter `tags:` count as tags.
pub(super) fn references(text_body: &str) -> (Vec<String>, Vec<String>) {
    let mut links = BTreeSet::new();
    let mut tags = BTreeSet::new();
    let mut lines = text_body.lines().peekable();
    if lines.peek().is_some_and(|line| line.trim() == "---") {
        lines.next();
        let mut in_tags = false;
        for line in lines.by_ref() {
            let trimmed = line.trim();
            if trimmed == "---" {
                break;
            }
            if let Some(rest) = trimmed.strip_prefix("tags:") {
                in_tags = true;
                for tag in rest.trim().trim_matches(['[', ']']).split(',') {
                    add_tag(&mut tags, tag);
                }
            } else if in_tags && trimmed.starts_with('-') {
                add_tag(&mut tags, trimmed.trim_start_matches('-'));
            } else {
                in_tags = false;
            }
        }
    }
    let rest: Vec<&str> = lines.collect();
    let mut fence = false;
    for line in rest {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fence = !fence;
            continue;
        }
        if fence {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        let mut code = false;
        while i < chars.len() {
            let c = chars[i];
            if c == '`' {
                code = !code;
            } else if !code && c == '[' && chars.get(i + 1) == Some(&'[') {
                if let Some(close) = (i + 2..chars.len().saturating_sub(1))
                    .find(|&j| chars[j] == ']' && chars[j + 1] == ']')
                {
                    let inner: String = chars[i + 2..close].iter().collect();
                    let target = inner.split(['|', '#', '^']).next().unwrap_or("").trim();
                    if !target.is_empty() {
                        links.insert(target.to_lowercase());
                    }
                    i = close + 2;
                    continue;
                }
            } else if !code
                && c == '#'
                && (i == 0 || chars[i - 1].is_whitespace() || chars[i - 1] == '(')
            {
                let tag: String = chars[i + 1..]
                    .iter()
                    .take_while(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '/'))
                    .collect();
                if !tag.is_empty() {
                    add_tag(&mut tags, &tag);
                    i += tag.chars().count() + 1;
                    continue;
                }
            }
            i += 1;
        }
    }
    (links.into_iter().collect(), tags.into_iter().collect())
}

fn add_tag(tags: &mut BTreeSet<String>, tag: &str) {
    let tag = tag.trim().trim_matches(['"', '\'']).trim_start_matches('#');
    if !tag.is_empty() && !tag.chars().all(|c| c.is_ascii_digit()) {
        tags.insert(tag.to_lowercase());
    }
}

/// Points [[old]], [[old|alias]], and [[old#heading]] at a new title.
fn rewrite_links(text_body: &str, old: &str, new: &str) -> String {
    let mut out = String::with_capacity(text_body.len());
    let mut rest = text_body;
    while let Some(start) = rest.find("[[") {
        out.push_str(&rest[..start + 2]);
        rest = &rest[start + 2..];
        let Some(end) = rest.find("]]") else {
            break;
        };
        let inner = &rest[..end];
        let cut = inner.find(['|', '#', '^']).unwrap_or(inner.len());
        if inner[..cut].trim().to_lowercase() == old.to_lowercase() {
            out.push_str(new);
            out.push_str(&inner[cut..]);
        } else {
            out.push_str(inner);
        }
        out.push_str("]]");
        rest = &rest[end + 2..];
    }
    out.push_str(rest);
    out
}

pub(super) fn seed(db: &Connection, now: i64) -> Result<()> {
    let notes = [
        (
            "Welcome to notes",
            "",
            true,
            "# Welcome to notes\n\nAda keeps your notes next to your focus time. Notes are plain **markdown**, and the editor shows them as you'll read them.\n\n- Link notes with double brackets, like [[Reading list]] or [[Project ideas]].\n- Label them with tags, like #ideas or #reading.\n- Press Ctrl+O to jump to any note, and Ctrl+Shift+F to search them all.\n- Open today's daily note from the calendar button.\n\n> [!tip] Backlinks\n> Every note lists the notes that link to it, so ideas find each other.\n\n## Checklists\n- [x] Write a first note\n- [ ] Link two notes together\n",
        ),
        (
            "Project ideas",
            "Projects",
            false,
            "---\ntags: [ideas]\n---\n# Project ideas\n\n1. A reading tracker that grows a library in the town.\n2. Weekly review template — see [[Weekly review]].\n\n| Idea | Effort | Excitement |\n| --- | --- | --- |\n| Reading tracker | Medium | High |\n| Garden planner | Low | Medium |\n",
        ),
        (
            "Weekly review",
            "Projects",
            false,
            "# Weekly review\n\n## What went well\n- Focused mornings on #writing\n\n## What to change\n- Fewer meetings on Tuesdays\n\nBack to [[Welcome to notes]].\n",
        ),
        (
            "Reading list",
            "",
            false,
            "# Reading list #reading\n\n- [ ] *Deep Work*\n- [x] *The Pragmatic Programmer*\n- [ ] ==Something new== from the library\n\n```\nNotes in code blocks keep their #hashes and [[brackets]] as text.\n```\n",
        ),
    ];
    for (i, (name, folder_path, pinned, text_body)) in notes.into_iter().enumerate() {
        let at = now - (i as i64 + 1) * 3_600_000;
        db.execute(
            "INSERT INTO notes(title, body, folder, pinned, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![name, text_body, folder_path, pinned, at],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn references_skip_code_and_read_frontmatter() {
        let (links, tags) = references(
            "---\ntags: [Ideas, \"work\"]\n---\n# Heading\nSee [[Alpha|the first]] and [[beta#Part]] #Todo.\n`#nope [[nope]]`\n```\n#also-nope [[gone]]\n```\nissue #42 and #2026-plans",
        );
        assert_eq!(links, vec!["alpha", "beta"]);
        assert_eq!(tags, vec!["2026-plans", "ideas", "todo", "work"]);
    }

    #[test]
    fn rename_rewrites_every_link_form() {
        assert_eq!(
            rewrite_links("[[Old]] [[old|x]] [[Old#h]] [[Older]]", "Old", "New"),
            "[[New]] [[New|x]] [[New#h]] [[Older]]"
        );
    }

    #[test]
    fn excerpts_and_snippets_read_as_prose() {
        assert_eq!(excerpt("---\na: b\n---\n# Title\n\n- [ ] Do **this**"), "Title Do this");
        assert_eq!(snippet("one two three", "TWO"), "one two three");
    }

    fn test_db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE sync_mute (x INTEGER); CREATE TABLE sync_dirty (kind TEXT, uid TEXT, PRIMARY KEY(kind, uid));").unwrap();
        db.create_scalar_function(
            "ada_uuid",
            2,
            rusqlite::functions::FunctionFlags::SQLITE_UTF8,
            |ctx| {
                let kind: Option<String> = ctx.get(0)?;
                let name: Option<String> = ctx.get(1)?;
                Ok(super::super::sync::uuid(kind.as_deref(), name.as_deref()))
            },
        )
        .unwrap();
        db.execute_batch(include_str!("../notes.sql")).unwrap();
        db.execute_batch(include_str!("../folders.sql")).unwrap();
        db
    }

    #[test]
    fn folders_crud_handles_empty_nested_and_note_backed_folders() {
        let db = test_db();
        create_folder(&db, "Projects/Ada/Sub").unwrap();
        create(&db, &uuid::Uuid::new_v4().to_string(), "Alpha", "Work/Notes", "hello".into(), 100).unwrap();
        create(&db, &uuid::Uuid::new_v4().to_string(), "Beta", "Projects/Ada", "world".into(), 200).unwrap();
        assert_eq!(
            folders(&db).unwrap(),
            vec!["Projects", "Projects/Ada", "Projects/Ada/Sub", "Work", "Work/Notes"]
        );

        rename_folder(&db, "Projects/Ada", "Archive/Ada", 300).unwrap();
        assert_eq!(
            folders(&db).unwrap(),
            vec!["Archive", "Archive/Ada", "Archive/Ada/Sub", "Work", "Work/Notes"]
        );

        delete_folder(&db, "Archive").unwrap();
        assert_eq!(folders(&db).unwrap(), vec!["Work", "Work/Notes"]);
        assert_eq!(notes(&db).unwrap().len(), 1);
    }
}
