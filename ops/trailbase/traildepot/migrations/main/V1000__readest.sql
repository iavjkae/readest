-- Readest application tables for Trailbase
-- Requirements for Record APIs:
-- - Tables must be STRICT
-- - Tables must have an INTEGER or UUID primary key

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id BLOB NOT NULL,
  book_hash TEXT NOT NULL,
  meta_hash TEXT,
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  source_title TEXT,
  author TEXT NOT NULL,
  group_id TEXT,
  group_name TEXT,
  tags TEXT,
  progress TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  uploaded_at TEXT,
  FOREIGN KEY(user_id) REFERENCES _user(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS books_user_book_hash_uq ON books(user_id, book_hash);
CREATE INDEX IF NOT EXISTS books_user_updated_at_idx ON books(user_id, updated_at);

CREATE TABLE IF NOT EXISTS book_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id BLOB NOT NULL,
  book_hash TEXT NOT NULL,
  meta_hash TEXT,
  location TEXT,
  xpointer TEXT,
  progress TEXT,
  search_config TEXT,
  view_settings TEXT,
  created_at TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(user_id) REFERENCES _user(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS book_configs_user_book_hash_uq ON book_configs(user_id, book_hash);
CREATE INDEX IF NOT EXISTS book_configs_user_updated_at_idx ON book_configs(user_id, updated_at);

CREATE TABLE IF NOT EXISTS book_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id BLOB NOT NULL,
  book_hash TEXT NOT NULL,
  meta_hash TEXT,
  note_id TEXT NOT NULL,
  type TEXT NOT NULL,
  cfi TEXT NOT NULL,
  text TEXT,
  style TEXT,
  color TEXT,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(user_id) REFERENCES _user(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS book_notes_user_book_hash_note_id_uq ON book_notes(user_id, book_hash, note_id);
CREATE INDEX IF NOT EXISTS book_notes_user_updated_at_idx ON book_notes(user_id, updated_at);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id BLOB NOT NULL,
  book_hash TEXT,
  file_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(user_id) REFERENCES _user(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS files_user_file_key_uq ON files(user_id, file_key);
CREATE INDEX IF NOT EXISTS files_user_created_at_idx ON files(user_id, created_at);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id BLOB NOT NULL,
  usage_type TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  increment INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES _user(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS usage_events_user_type_date_idx ON usage_events(user_id, usage_type, usage_date);
