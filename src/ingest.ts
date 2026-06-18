import { canonicalUrl } from "./canonical";
import type { Db } from "./db/connection";
import type { RawBookmark } from "./source/types";

export interface IngestResult {
  total: number;
  inserted: number;
  existing: number;
}

// A short, human-readable title derived from the tweet text. reading.db stores only this thin
// overlay (id, ft_id, url, canonical_url, title, status); the full text stays in the corpus.
export function deriveTitle(b: RawBookmark): string {
  const text = (b.text ?? "").replace(/\s+/g, " ").trim();
  if (text.length > 0) {
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }
  const handle = b.authorHandle ?? b.author?.handle;
  return handle ? `@${handle} post` : "Untitled bookmark";
}

// Records only new bookmarks as 'unread'. Dedupes by Field Theory id first, then by canonical URL.
// Existing items keep their current status, so a re-sync never resets reading progress. Runs in a
// single transaction.
export function recordDeltas(db: Db, bookmarks: RawBookmark[]): IngestResult {
  const findByFtId = db.prepare("SELECT id FROM items WHERE ft_id = ?");
  const findByCanonical = db.prepare("SELECT id FROM items WHERE canonical_url = ?");
  const insert = db.prepare(
    `INSERT INTO items (id, ft_id, url, canonical_url, title, status, bookmarked_at)
     VALUES (@id, @ftId, @url, @canonicalUrl, @title, 'unread', @bookmarkedAt)`,
  );

  let inserted = 0;
  let existing = 0;

  const run = db.transaction((rows: RawBookmark[]) => {
    for (const b of rows) {
      const ftId = b.id;
      const canonical = canonicalUrl(b.url);
      if (findByFtId.get(ftId) || findByCanonical.get(canonical)) {
        existing++;
        continue;
      }
      insert.run({
        id: ftId,
        ftId,
        url: b.url,
        canonicalUrl: canonical,
        title: deriveTitle(b),
        bookmarkedAt: b.bookmarkedAt ?? null,
      });
      inserted++;
    }
  });

  run(bookmarks);
  return { total: bookmarks.length, inserted, existing };
}
