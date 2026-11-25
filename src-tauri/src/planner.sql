CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);
ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id);
ALTER TABLE tasks ADD COLUMN important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1));
ALTER TABLE tasks ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1));
ALTER TABLE tasks ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0 CHECK (in_progress IN (0, 1));
ALTER TABLE tasks ADD COLUMN recurrence TEXT CHECK (recurrence IN ('daily', 'weekly', 'monthly'));
ALTER TABLE tasks ADD COLUMN recurrence_day INTEGER CHECK (recurrence_day BETWEEN 1 AND 31);
ALTER TABLE tasks ADD COLUMN previous_id INTEGER REFERENCES tasks(id);
CREATE UNIQUE INDEX one_next_occurrence ON tasks(previous_id) WHERE previous_id IS NOT NULL;

CREATE TABLE subtasks (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    PRIMARY KEY (task_id, position)
);

ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id);
CREATE INDEX sessions_by_project ON sessions(project_id);
