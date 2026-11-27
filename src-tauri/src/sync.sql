-- Sync between PCs. Every synced row gets a stable uid; triggers record each change as a
-- pending operation (sync_dirty) in the same transaction as the change itself.
-- ada_uuid(kind, name) is registered by Ada: a NULL kind gives a random UUID, otherwise a
-- UUID derived from kind and the lowercased name, so two PCs derive the same id.

ALTER TABLE tags ADD COLUMN uid TEXT;
ALTER TABLE projects ADD COLUMN uid TEXT;
ALTER TABLE tasks ADD COLUMN uid TEXT;
ALTER TABLE sessions ADD COLUMN uid TEXT;

UPDATE tags SET uid = ada_uuid('tag', name);
UPDATE tags SET uid = ada_uuid(NULL, NULL) WHERE id NOT IN (SELECT MIN(id) FROM tags GROUP BY uid);
UPDATE projects SET uid = ada_uuid('project', name);
UPDATE projects SET uid = ada_uuid(NULL, NULL) WHERE id NOT IN (SELECT MIN(id) FROM projects GROUP BY uid);
UPDATE tasks SET uid = ada_uuid(NULL, NULL);
UPDATE sessions SET uid = ada_uuid(NULL, NULL);

CREATE UNIQUE INDEX tags_by_uid ON tags(uid);
CREATE UNIQUE INDEX projects_by_uid ON projects(uid);
CREATE UNIQUE INDEX tasks_by_uid ON tasks(uid);
CREATE UNIQUE INDEX sessions_by_uid ON sessions(uid);

-- While a row exists here, the triggers below stay quiet (Ada is applying synced changes).
CREATE TABLE sync_mute (x INTEGER);

-- Records changed on this PC that still need to be pushed.
CREATE TABLE sync_dirty (
    kind TEXT NOT NULL,
    uid TEXT NOT NULL,
    restore INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, uid)
) WITHOUT ROWID;

-- The server's version of each record as last seen: the common ancestor for merging.
CREATE TABLE sync_shadow (
    kind TEXT NOT NULL,
    uid TEXT NOT NULL,
    fields TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL,
    PRIMARY KEY (kind, uid)
) WITHOUT ROWID;

-- Operations frozen for a push, resent unchanged until the server answers.
CREATE TABLE sync_outbox (
    op_id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    uid TEXT NOT NULL,
    payload TEXT NOT NULL
);

-- Edits that collided with another PC's edit, waiting for review.
CREATE TABLE sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    uid TEXT NOT NULL,
    field TEXT NOT NULL,
    mine TEXT,
    theirs TEXT,
    at INTEGER NOT NULL,
    UNIQUE (kind, uid, field)
);

-- Pulled records that refer to something that hasn't arrived yet.
CREATE TABLE sync_inbox (
    kind TEXT NOT NULL,
    uid TEXT NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (kind, uid)
) WITHOUT ROWID;

CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device TEXT NOT NULL,
    cursor INTEGER NOT NULL DEFAULT 0,
    last_synced_at INTEGER,
    last_error TEXT
);
INSERT INTO sync_state(id, device) VALUES (1, ada_uuid(NULL, NULL));

INSERT INTO sync_dirty(kind, uid) SELECT 'tag', uid FROM tags;
INSERT INTO sync_dirty(kind, uid) SELECT 'project', uid FROM projects;
INSERT INTO sync_dirty(kind, uid) SELECT 'task', uid FROM tasks;
INSERT INTO sync_dirty(kind, uid) SELECT 'session', uid FROM sessions WHERE ended_at IS NOT NULL;

-- Tags and projects take a uid derived from their name, so the same name made on two PCs
-- is one record. A recurring task's next occurrence derives its uid from the previous one.
CREATE TRIGGER tags_inserted AFTER INSERT ON tags BEGIN
    UPDATE tags SET uid = CASE
        WHEN EXISTS (SELECT 1 FROM tags WHERE uid = ada_uuid('tag', NEW.name)) THEN ada_uuid(NULL, NULL)
        ELSE ada_uuid('tag', NEW.name) END
    WHERE id = NEW.id AND uid IS NULL;
    INSERT OR IGNORE INTO sync_dirty(kind, uid)
    SELECT 'tag', uid FROM tags WHERE id = NEW.id AND NOT EXISTS (SELECT 1 FROM sync_mute);
END;
CREATE TRIGGER tags_updated AFTER UPDATE ON tags WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('tag', NEW.uid);
END;
CREATE TRIGGER tags_deleted AFTER DELETE ON tags WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('tag', OLD.uid);
END;

CREATE TRIGGER projects_inserted AFTER INSERT ON projects BEGIN
    UPDATE projects SET uid = CASE
        WHEN EXISTS (SELECT 1 FROM projects WHERE uid = ada_uuid('project', NEW.name)) THEN ada_uuid(NULL, NULL)
        ELSE ada_uuid('project', NEW.name) END
    WHERE id = NEW.id AND uid IS NULL;
    INSERT OR IGNORE INTO sync_dirty(kind, uid)
    SELECT 'project', uid FROM projects WHERE id = NEW.id AND NOT EXISTS (SELECT 1 FROM sync_mute);
END;
CREATE TRIGGER projects_updated AFTER UPDATE ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('project', NEW.uid);
END;
CREATE TRIGGER projects_deleted AFTER DELETE ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('project', OLD.uid);
END;

CREATE TRIGGER tasks_inserted AFTER INSERT ON tasks BEGIN
    UPDATE tasks SET uid = CASE
        WHEN NOT EXISTS (SELECT 1 FROM tasks WHERE uid =
            ada_uuid('next', (SELECT uid FROM tasks WHERE id = NEW.previous_id)))
        THEN ada_uuid('next', (SELECT uid FROM tasks WHERE id = NEW.previous_id))
        ELSE ada_uuid(NULL, NULL) END
    WHERE id = NEW.id AND uid IS NULL;
    INSERT OR IGNORE INTO sync_dirty(kind, uid)
    SELECT 'task', uid FROM tasks WHERE id = NEW.id AND NOT EXISTS (SELECT 1 FROM sync_mute);
END;
CREATE TRIGGER tasks_updated AFTER UPDATE ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('task', NEW.uid);
END;
CREATE TRIGGER tasks_deleted AFTER DELETE ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('task', OLD.uid);
END;

CREATE TRIGGER task_tags_inserted AFTER INSERT ON task_tags WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) SELECT 'task', uid FROM tasks WHERE id = NEW.task_id;
END;
CREATE TRIGGER task_tags_deleted AFTER DELETE ON task_tags WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) SELECT 'task', uid FROM tasks WHERE id = OLD.task_id;
END;
CREATE TRIGGER subtasks_inserted AFTER INSERT ON subtasks WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) SELECT 'task', uid FROM tasks WHERE id = NEW.task_id;
END;
CREATE TRIGGER subtasks_updated AFTER UPDATE ON subtasks WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) SELECT 'task', uid FROM tasks WHERE id = NEW.task_id;
END;
CREATE TRIGGER subtasks_deleted AFTER DELETE ON subtasks WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) SELECT 'task', uid FROM tasks WHERE id = OLD.task_id;
END;

-- A session syncs once it has ended; the running timer stays on this PC.
CREATE TRIGGER sessions_inserted AFTER INSERT ON sessions BEGIN
    UPDATE sessions SET uid = ada_uuid(NULL, NULL) WHERE id = NEW.id AND uid IS NULL;
    INSERT OR IGNORE INTO sync_dirty(kind, uid)
    SELECT 'session', uid FROM sessions
    WHERE id = NEW.id AND ended_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sync_mute);
END;
CREATE TRIGGER sessions_updated AFTER UPDATE ON sessions
WHEN NEW.ended_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('session', NEW.uid);
END;
CREATE TRIGGER sessions_deleted AFTER DELETE ON sessions
WHEN OLD.ended_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid) VALUES ('session', OLD.uid);
END;
CREATE TRIGGER intervals_inserted AFTER INSERT ON intervals WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid)
    SELECT 'session', uid FROM sessions WHERE id = NEW.session_id AND ended_at IS NOT NULL;
END;
CREATE TRIGGER intervals_deleted AFTER DELETE ON intervals WHEN NOT EXISTS (SELECT 1 FROM sync_mute) BEGIN
    INSERT OR IGNORE INTO sync_dirty(kind, uid)
    SELECT 'session', uid FROM sessions WHERE id = OLD.session_id AND ended_at IS NOT NULL;
END;
