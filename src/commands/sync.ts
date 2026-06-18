import type { Config } from "../config";
import { openDb } from "../db/connection";
import { refreshReadingHome } from "../home";
import { type IngestResult, recordDeltas } from "../ingest";
import { FieldTheorySource } from "../source/field-theory";
import { ManualExportSource } from "../source/manual-export";
import type { BookmarkSource, SyncOptions } from "../source/types";

export interface SyncCommandOptions extends SyncOptions {
  // Path to a JSONL dump. When set, ingest from it via ManualExportSource instead of Field Theory.
  // This is the realistic fallback for when session-based ft sync breaks.
  manual?: string;
}

export interface SyncCommandResult extends IngestResult {
  unreadTotal: number;
  pulled: boolean;
  sourceId: BookmarkSource["id"];
  homeWritten: string;
}

interface CountRow {
  n: number;
}

// Reads the corpus and records new items as 'unread', then refreshes Reading-Home so the ambient
// nudge reflects the new state. The default source is Field Theory (local read; with opts.pull it
// first runs `ft sync --no-media`). With opts.manual it reads a JSONL dump instead. Never writes to
// the Field Theory corpus.
export async function runSync(
  config: Config,
  opts: SyncCommandOptions = {},
): Promise<SyncCommandResult> {
  if (opts.manual && opts.pull) {
    throw new Error(
      "reading sync: --manual cannot be combined with --pull (a static dump has nothing to pull)",
    );
  }

  const source: BookmarkSource = opts.manual
    ? new ManualExportSource(opts.manual)
    : new FieldTheorySource();
  const corpus = opts.pull ? await source.sync(opts) : await source.list();

  const db = openDb(config.dbPath);
  try {
    const result = recordDeltas(db, corpus);
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM items WHERE status = 'unread'")
      .get() as CountRow;
    const homeWritten = refreshReadingHome(db, config.vaultRoot);
    return {
      ...result,
      unreadTotal: row.n,
      pulled: Boolean(opts.pull),
      sourceId: source.id,
      homeWritten,
    };
  } finally {
    db.close();
  }
}
