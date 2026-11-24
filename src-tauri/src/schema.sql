CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    startup TEXT NOT NULL DEFAULT 'today',
    theme TEXT NOT NULL DEFAULT 'dark',
    town_visibility TEXT NOT NULL DEFAULT 'focus',
    notifications INTEGER NOT NULL DEFAULT 1,
    last_target_ms INTEGER DEFAULT 1500000,
    onboarded INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO settings(id) VALUES (1);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    lot INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    due TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    last_tag_id INTEGER REFERENCES tags(id)
);
CREATE TABLE IF NOT EXISTS task_tags (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (task_id, tag_id)
);
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    task_id INTEGER REFERENCES tasks(id),
    activity TEXT NOT NULL,
    target_ms INTEGER,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    running_since INTEGER,
    heartbeat_at INTEGER,
    recovery_to INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions ((1)) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS intervals (
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL CHECK (end > start),
    PRIMARY KEY (session_id, start)
);
CREATE TABLE IF NOT EXISTS progression (
    version INTEGER NOT NULL,
    stage INTEGER NOT NULL,
    minutes INTEGER NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (version, stage)
);
INSERT OR IGNORE INTO progression VALUES
    (1, 1, 5, 'First structure'),
    (1, 2, 60, 'Starter building'),
    (1, 3, 180, 'First expansion');
