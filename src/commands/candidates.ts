import { type Candidate, type Classification, buildCandidates } from "../candidates";
import type { Config } from "../config";
import { openDb } from "../db/connection";
import { FieldTheorySource } from "../source/field-theory";

export interface CandidatesOptions {
  limit?: number;
  order?: "newest" | "oldest";
  before?: string;
}

// Assembles the ranking-ready candidate set for Claude Code: unread items enriched from the live
// corpus. Read-only on both the corpus and reading.db. The Field Theory classification join is
// best-effort: if `ft list --json` fails (for example classification has not run, or the index is
// missing), candidates still build with null category rather than breaking the core loop.
export async function runCandidates(
  config: Config,
  opts: CandidatesOptions = {},
): Promise<Candidate[]> {
  const source = new FieldTheorySource();
  const corpus = await source.list();

  let classification: Map<string, Classification> | undefined;
  try {
    classification = source.listClassified();
  } catch {
    classification = undefined;
  }

  const db = openDb(config.dbPath);
  try {
    return buildCandidates(
      db,
      corpus,
      { limit: opts.limit, order: opts.order, before: opts.before },
      { classification },
    );
  } finally {
    db.close();
  }
}
