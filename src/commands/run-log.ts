import type { Config } from "../config";
import { openDb } from "../db/connection";

export interface RunLogEntry {
  id: string;
  kind: string | null;
  createdAt: string | null;
  summary: string | null;
  itemCount: number;
}

export interface RunLogOptions {
  limit?: number;
}

const DEFAULT_LIMIT = 10;

interface RunRow {
  id: string;
  kind: string | null;
  created_at: string | null;
  summary: string | null;
  item_count: number;
}

// Read-only history of curation runs, most recent first. The append side is owned by `reading
// write`, which records each run into curation_runs and run_items; this command only reads them, so
// it never refreshes Reading-Home or mutates state.
export function runRunLog(config: Config, opts: RunLogOptions = {}): RunLogEntry[] {
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;
  const db = openDb(config.dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT cr.id AS id,
                cr.kind AS kind,
                cr.created_at AS created_at,
                cr.summary AS summary,
                (SELECT COUNT(*) FROM run_items ri WHERE ri.run_id = cr.id) AS item_count
           FROM curation_runs cr
          ORDER BY cr.created_at DESC, cr.id DESC
          LIMIT ?`,
      )
      .all(limit) as RunRow[];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      createdAt: r.created_at,
      summary: r.summary,
      itemCount: r.item_count,
    }));
  } finally {
    db.close();
  }
}
