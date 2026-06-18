import type { Config } from "../config";
import { openDb } from "../db/connection";
import { refreshReadingHome } from "../home";

export interface MarkOptions {
  id: string;
  read?: boolean;
  shared?: boolean;
  skipped?: boolean;
}

export type MarkStatus = "read" | "shared" | "skipped";

export interface MarkResult {
  id: string;
  previousStatus: string;
  newStatus: MarkStatus;
  homeWritten: string;
}

interface ItemStatusRow {
  status: string;
}

function chosenStatus(opts: MarkOptions): MarkStatus {
  const flags: MarkStatus[] = [];
  if (opts.read) {
    flags.push("read");
  }
  if (opts.shared) {
    flags.push("shared");
  }
  if (opts.skipped) {
    flags.push("skipped");
  }
  if (flags.length === 0) {
    throw new Error("reading mark: pass exactly one of --read, --shared, or --skipped");
  }
  if (flags.length > 1) {
    throw new Error(`reading mark: pass only one status flag, got ${flags.join(", ")}`);
  }
  return flags[0];
}

// Set an item's reading status by its stable id, then refresh Reading-Home. Status is the only column
// that changes; the scores and last_queued_at stay as the curation run left them. Marking an item to
// the status it already holds is an idempotent no-op. An archived item is rejected, since reviving it
// is a resurfacing concern rather than a status edit.
export function runMark(config: Config, opts: MarkOptions): MarkResult {
  const newStatus = chosenStatus(opts);
  const db = openDb(config.dbPath);
  try {
    const row = db.prepare("SELECT status FROM items WHERE id = ?").get(opts.id) as
      | ItemStatusRow
      | undefined;
    if (!row) {
      throw new Error(`reading mark: unknown item id: ${opts.id} (run \`reading sync\` first?)`);
    }
    if (row.status === "archived") {
      throw new Error(`reading mark: item ${opts.id} is archived and cannot be re-marked`);
    }
    if (row.status !== newStatus) {
      db.prepare("UPDATE items SET status = ? WHERE id = ?").run(newStatus, opts.id);
    }
    const homeWritten = refreshReadingHome(db, config.vaultRoot);
    return { id: opts.id, previousStatus: row.status, newStatus, homeWritten };
  } finally {
    db.close();
  }
}
