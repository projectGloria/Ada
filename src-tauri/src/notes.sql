-- Markdown notes. A note syncs like a task: a stable uid, and triggers queue every change
-- in sync_dirty. updated_at is local only, so it never collides between PCs.
-- Daily notes take uid ada_uuid('daily', date), so two PCs open the same daily note.

CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    uid TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX notes_by_uid ON notes(uid);
CREATE INDEX notes_by_title ON notes(title COLLATE NOCASE);

CREATE TRIGGER notes_inserted AFTER INSERT ON notes BEGIN
    UPDATE notes SET uid = ada_uuid(NULL, NULL) WHERE id = NEW.id AND uid IS NULL;
    INSERT OR IGNORE INTO sync_dirty(kind, uid)
    SELECT 'note', uid FROM notes WHERE id = NEW.id AND NOT EXISTS (SELECT 1 FROM sync_mute);
END;
CREATE TRIGGER notes_updated AFTER UPDATE OF title, body, folder, pinned, created_at ON notes
WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('note', NEW.uid);
END;
CREATE TRIGGER notes_deleted AFTER DELETE ON notes WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('note', OLD.uid);
END;
