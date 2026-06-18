import type { Config } from "../config";
import { openDb } from "../db/connection";
import { type ProfileReview, buildProfileReview } from "../profile-review";
import { FieldTheorySource } from "../source/field-theory";

// Read-only. Opens reading.db and, best-effort, the corpus for author enrichment by ft_id (items has
// no author column; author lives in the corpus). A missing or unreadable corpus degrades to
// author: null rather than failing the review, because this is a reporting command, not a mutation.
export async function runProfileReview(config: Config): Promise<ProfileReview> {
  const authorByFtId = new Map<string, string | null>();
  try {
    const corpus = await new FieldTheorySource().list();
    for (const b of corpus) {
      authorByFtId.set(b.id, b.authorHandle ?? b.author?.handle ?? null);
    }
  } catch {
    // best-effort; author falls back to null and the review still returns.
  }

  const db = openDb(config.dbPath);
  try {
    return buildProfileReview(db, authorByFtId);
  } finally {
    db.close();
  }
}
