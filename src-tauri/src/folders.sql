-- Explicit note folders so empty folders and subfolders persist in the sidebar.
-- Local only; synced notes also contribute their folder paths automatically.
CREATE TABLE note_folders (
    path TEXT PRIMARY KEY
);
