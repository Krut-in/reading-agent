import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/db/schema";
import { buildProfileReview } from "../src/profile-review";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function addItem(
  db: Database.Database,
  opts: {
    id: string;
    status?: string;
    content_type?: string | null;
    title?: string | null;
    last_queued_at?: string | null;
  },
): void {
  const url = `https://x.com/u/status/${opts.id}`;
  db.prepare(
    "INSERT INTO items (id, ft_id, url, canonical_url, title, content_type, status, last_queued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    opts.id,
    opts.id,
    url,
    url,
    opts.title ?? null,
    opts.content_type ?? null,
    opts.status ?? "unread",
    opts.last_queued_at ?? null,
  );
}

function addRun(
  db: Database.Database,
  runId: string,
  kind: string,
  createdAt: string,
  itemIds: string[],
): void {
  db.prepare("INSERT INTO curation_runs (id, kind, created_at, summary) VALUES (?, ?, ?, ?)").run(
    runId,
    kind,
    createdAt,
    `${kind} run`,
  );
  for (const id of itemIds) {
    db.prepare(
      "INSERT INTO run_items (run_id, item_id, selected_for, reason) VALUES (?, ?, ?, ?)",
    ).run(runId, id, kind, "hook");
  }
}

function addTopic(db: Database.Database, slug: string, name: string, itemIds: string[]): void {
  db.prepare("INSERT INTO topics (id, name, notes_path) VALUES (?, ?, ?)").run(
    slug,
    name,
    `Topics/${slug}.md`,
  );
  for (const id of itemIds) {
    db.prepare("INSERT INTO item_topics (item_id, topic_id) VALUES (?, ?)").run(id, slug);
  }
}

describe("buildProfileReview", () => {
  it("returns a well-formed empty shape with no history", () => {
    const db = freshDb();
    const r = buildProfileReview(db, new Map());
    expect(r.totals).toMatchObject({
      unread: 0,
      queued: 0,
      read: 0,
      shared: 0,
      skipped: 0,
      archived: 0,
    });
    expect(r.read).toEqual([]);
    expect(r.shared).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.queued_stale).toEqual([]);
    expect(r.by_content_type).toEqual([]);
    expect(r.by_author).toEqual([]);
    expect(r.by_topic).toEqual([]);
    expect(r.recent_runs).toEqual([]);
    db.close();
  });

  it("counts totals by status", () => {
    const db = freshDb();
    addItem(db, { id: "1", status: "unread" });
    addItem(db, { id: "2", status: "queued" });
    addItem(db, { id: "3", status: "read" });
    addItem(db, { id: "4", status: "shared" });
    addItem(db, { id: "5", status: "skipped" });
    const r = buildProfileReview(db, new Map());
    expect(r.totals).toMatchObject({
      unread: 1,
      queued: 1,
      read: 1,
      shared: 1,
      skipped: 1,
      archived: 0,
    });
    db.close();
  });

  it("enriches read items with author, topics, and content_type", () => {
    const db = freshDb();
    addItem(db, { id: "10", status: "read", content_type: "article", title: "A" });
    addTopic(db, "ai-agents", "AI agents", ["10"]);
    const r = buildProfileReview(db, new Map([["10", "alice"]]));
    expect(r.read).toHaveLength(1);
    expect(r.read[0]).toMatchObject({
      id: "10",
      author: "alice",
      content_type: "article",
      topics: ["AI agents"],
    });
    db.close();
  });

  it("falls back to author null when the corpus lacks the id", () => {
    const db = freshDb();
    addItem(db, { id: "11", status: "read" });
    const r = buildProfileReview(db, new Map());
    expect(r.read[0]?.author).toBeNull();
    db.close();
  });

  it("flags queued items in two or more runs as stale and excludes the rest", () => {
    const db = freshDb();
    addItem(db, { id: "20", status: "queued" });
    addItem(db, { id: "21", status: "queued" });
    addItem(db, { id: "22", status: "read" });
    addRun(db, "now-2026-06-01", "now", "2026-06-01T00:00:00Z", ["20", "22"]);
    addRun(db, "resurface-2026-06-05", "resurface", "2026-06-05T00:00:00Z", ["20", "22"]);
    addRun(db, "now-2026-06-07", "now", "2026-06-07T00:00:00Z", ["21"]);
    const r = buildProfileReview(db, new Map());
    expect(r.queued_stale.map((s) => s.id)).toEqual(["20"]);
    expect(r.queued_stale[0]?.run_count).toBe(2);
    db.close();
  });

  it("rolls up by content type, author, and topic over read, shared, and queued", () => {
    const db = freshDb();
    addItem(db, { id: "30", status: "read", content_type: "article" });
    addItem(db, { id: "31", status: "shared", content_type: "article" });
    addItem(db, { id: "32", status: "queued", content_type: "thread" });
    addTopic(db, "coding", "coding", ["30", "31"]);
    const r = buildProfileReview(
      db,
      new Map([
        ["30", "alice"],
        ["31", "alice"],
        ["32", "bob"],
      ]),
    );
    expect(r.by_content_type).toEqual([
      { key: "article", read: 1, shared: 1, queued: 0 },
      { key: "thread", read: 0, shared: 0, queued: 1 },
    ]);
    expect(r.by_author.find((d) => d.key === "alice")).toMatchObject({
      read: 1,
      shared: 1,
      queued: 0,
    });
    expect(r.by_topic).toEqual([{ key: "coding", read: 1, shared: 1, queued: 0 }]);
    db.close();
  });

  it("lists recent runs newest first with item counts", () => {
    const db = freshDb();
    addItem(db, { id: "40", status: "queued" });
    addItem(db, { id: "41", status: "queued" });
    addRun(db, "now-2026-06-01", "now", "2026-06-01T00:00:00Z", ["40"]);
    addRun(db, "now-2026-06-08", "now", "2026-06-08T00:00:00Z", ["40", "41"]);
    const r = buildProfileReview(db, new Map());
    expect(r.recent_runs.map((x) => x.id)).toEqual(["now-2026-06-08", "now-2026-06-01"]);
    expect(r.recent_runs[0]?.items).toBe(2);
    db.close();
  });

  it("does not write to the db", () => {
    const db = freshDb();
    addItem(db, { id: "50", status: "read" });
    buildProfileReview(db, new Map());
    expect((db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM topics").get() as { n: number }).n).toBe(0);
    db.close();
  });
});
