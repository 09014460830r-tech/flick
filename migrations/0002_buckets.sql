-- Replace todo/doing/done with four buckets plus a done flag, so a finished
-- task remembers which bucket it came from.
CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'now' CHECK (bucket IN ('now', 'later', 'someday', 'other')),
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO tasks_new (id, user_id, text, bucket, done, created_at, updated_at)
SELECT id, user_id, text, 'now', CASE WHEN status = 'done' THEN 1 ELSE 0 END, created_at, updated_at FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX idx_tasks_user ON tasks(user_id, created_at DESC);
