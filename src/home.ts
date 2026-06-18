import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db/connection";
import { type ReadingHomeModel, renderReadingHome } from "./render/reading-home";

export const READING_HOME_RELPATH = path.join("System", "Reading-Home.md");

interface HomeRow {
  id: string;
  title: string | null;
  estimated_time_minutes: number | null;
  reason: string | null;
}

// The single most compelling curated pick is the highest-priority queued item. The ORDER BY is a
// total order, so the choice is deterministic even when scores tie or are null: non-null scores rank
// ahead of nulls, then higher score, then more recently queued, then lowest id as the final
// tiebreak. The hook is the reason from the item's most recent curation run.
export function selectHomeModel(db: Db): ReadingHomeModel {
  const gemCount = (
    db.prepare("SELECT COUNT(*) AS n FROM items WHERE status = 'queued'").get() as { n: number }
  ).n;

  const row = db
    .prepare(
      `SELECT i.id AS id,
              i.title AS title,
              i.estimated_time_minutes AS estimated_time_minutes,
              (SELECT ri.reason
                 FROM run_items ri
                 JOIN curation_runs cr ON cr.id = ri.run_id
                WHERE ri.item_id = i.id
                ORDER BY cr.created_at DESC, ri.run_id DESC
                LIMIT 1) AS reason
         FROM items i
        WHERE i.status = 'queued'
        ORDER BY (i.priority_score IS NULL), i.priority_score DESC, i.last_queued_at DESC, i.id ASC
        LIMIT 1`,
    )
    .get() as HomeRow | undefined;

  if (!row) {
    return { gemCount, topPick: null };
  }
  return {
    gemCount,
    topPick: {
      id: row.id,
      title: row.title ?? row.id,
      hook: row.reason ?? "",
      estimatedTimeMinutes: row.estimated_time_minutes,
    },
  };
}

// Render the Reading-Home note from current state and overwrite the file. Every state-changing
// command calls this, so the ambient nudge always reflects reality. Callers that already computed the
// model can pass it to avoid a second query; otherwise it is selected here. Returns the
// vault-relative path.
export function refreshReadingHome(
  db: Db,
  vaultRoot: string,
  model: ReadingHomeModel = selectHomeModel(db),
): string {
  const full = path.join(vaultRoot, READING_HOME_RELPATH);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, renderReadingHome(model), "utf8");
  return READING_HOME_RELPATH;
}
