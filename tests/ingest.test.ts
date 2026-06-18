import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/db/schema";
import { deriveTitle, recordDeltas } from "../src/ingest";
import { parseBookmarksJsonl } from "../src/source/types";

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "bookmarks.sample.jsonl");

function fixtureBookmarks() {
  return parseBookmarksJsonl(fs.readFileSync(FIXTURE, "utf8")).bookmarks;
}

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function unreadCount(db: Database.Database): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM items WHERE status = 'unread'").get() as {
      n: number;
    }
  ).n;
}

describe("recordDeltas", () => {
  it("inserts new items as unread and dedupes by ft_id and canonical url", () => {
    const db = freshDb();
    const result = recordDeltas(db, fixtureBookmarks());
    expect(result.total).toBe(3);
    expect(result.inserted).toBe(2);
    expect(result.existing).toBe(1);
    expect(unreadCount(db)).toBe(2);
    db.close();
  });

  it("is idempotent on a re-sync", () => {
    const db = freshDb();
    recordDeltas(db, fixtureBookmarks());
    const second = recordDeltas(db, fixtureBookmarks());
    expect(second.inserted).toBe(0);
    expect(second.existing).toBe(3);
    expect(unreadCount(db)).toBe(2);
    db.close();
  });

  it("stores only the thin overlay, not corpus text", () => {
    const db = freshDb();
    recordDeltas(db, fixtureBookmarks());
    const row = db.prepare("SELECT * FROM items WHERE ft_id = '100'").get() as Record<
      string,
      unknown
    >;
    expect(row.ft_id).toBe("100");
    expect(row.canonical_url).toBe("https://x.com/alpha/status/100");
    expect(typeof row.title).toBe("string");
    expect((row.title as string).length).toBeLessThanOrEqual(80);
    db.close();
  });

  it("derives a short title from text", () => {
    const [first] = fixtureBookmarks();
    expect(deriveTitle(first)).toContain("judgment layer");
  });
});
