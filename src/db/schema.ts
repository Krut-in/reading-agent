import type { Db } from "./connection";

export const SCHEMA_VERSION = 1;

// reading.db holds reading state only and references Field Theory ids and URLs; it never duplicates
// the corpus.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  ft_id TEXT,
  url TEXT,
  canonical_url TEXT,
  title TEXT,
  content_type TEXT,
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread','queued','read','shared','skipped','archived')),
  bookmarked_at TEXT,
  last_queued_at TEXT,
  priority_score REAL,
  usefulness_score REAL,
  interest_score REAL,
  popularity_score REAL,
  recency_score REAL,
  estimated_time_minutes INTEGER
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes_path TEXT
);

CREATE TABLE IF NOT EXISTS item_topics (
  item_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  PRIMARY KEY (item_id, topic_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS curation_runs (
  id TEXT PRIMARY KEY,
  kind TEXT,
  created_at TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS run_items (
  run_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  selected_for TEXT,
  reason TEXT,
  PRIMARY KEY (run_id, item_id),
  FOREIGN KEY (run_id) REFERENCES curation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_ft_id ON items(ft_id);
CREATE INDEX IF NOT EXISTS idx_items_canonical_url ON items(canonical_url);
`;

export function getSchemaVersion(db: Db): number {
  return db.pragma("user_version", { simple: true }) as number;
}

// Idempotent. Creates tables if absent and stamps the schema version. Safe to re-run.
export function initSchema(db: Db): number {
  db.exec(SCHEMA_SQL);
  if (getSchemaVersion(db) < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  return SCHEMA_VERSION;
}
