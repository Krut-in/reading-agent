import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "../src/db/schema";
import { refreshReadingHome, selectHomeModel } from "../src/home";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-home-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

interface ItemFields {
  id: string;
  status: string;
  title?: string;
  priority?: number | null;
  lastQueuedAt?: string | null;
  estMinutes?: number | null;
}

function addItem(db: Database.Database, fields: ItemFields): void {
  db.prepare(
    `INSERT INTO items
       (id, ft_id, url, canonical_url, title, status, last_queued_at, priority_score, estimated_time_minutes)
     VALUES (@id, @id, @url, @url, @title, @status, @lastQueuedAt, @priority, @estMinutes)`,
  ).run({
    id: fields.id,
    url: `https://x.com/u/status/${fields.id}`,
    title: fields.title ?? `Title ${fields.id}`,
    status: fields.status,
    lastQueuedAt: fields.lastQueuedAt ?? null,
    priority: fields.priority ?? null,
    estMinutes: fields.estMinutes ?? null,
  });
}

function addRun(db: Database.Database, runId: string, itemId: string, reason: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO curation_runs (id, kind, created_at, summary) VALUES (?, ?, ?, ?)",
  ).run(runId, "now", "2026-06-09T00:00:00.000Z", null);
  db.prepare(
    "INSERT INTO run_items (run_id, item_id, selected_for, reason) VALUES (?, ?, ?, ?)",
  ).run(runId, itemId, "now", reason);
}

describe("selectHomeModel", () => {
  it("reports an empty model when nothing is queued", () => {
    const db = freshDb();
    addItem(db, { id: "1", status: "unread" });
    const model = selectHomeModel(db);
    expect(model.gemCount).toBe(0);
    expect(model.topPick).toBeNull();
    db.close();
  });

  it("counts only queued items and picks the highest priority", () => {
    const db = freshDb();
    addItem(db, { id: "1", status: "queued", priority: 0.4 });
    addItem(db, { id: "2", status: "queued", priority: 0.9, title: "Winner" });
    addItem(db, { id: "3", status: "unread", priority: 1.0 });
    addRun(db, "r1", "2", "why two");
    const model = selectHomeModel(db);
    expect(model.gemCount).toBe(2);
    expect(model.topPick?.id).toBe("2");
    expect(model.topPick?.title).toBe("Winner");
    expect(model.topPick?.hook).toBe("why two");
    db.close();
  });

  it("breaks a priority tie by most recently queued", () => {
    const db = freshDb();
    addItem(db, {
      id: "b",
      status: "queued",
      priority: 0.5,
      lastQueuedAt: "2026-06-01T00:00:00.000Z",
    });
    addItem(db, {
      id: "a",
      status: "queued",
      priority: 0.5,
      lastQueuedAt: "2026-06-09T00:00:00.000Z",
    });
    expect(selectHomeModel(db).topPick?.id).toBe("a");
    db.close();
  });

  it("breaks a full tie by lowest id", () => {
    const db = freshDb();
    addItem(db, {
      id: "b",
      status: "queued",
      priority: 0.5,
      lastQueuedAt: "2026-06-01T00:00:00.000Z",
    });
    addItem(db, {
      id: "a",
      status: "queued",
      priority: 0.5,
      lastQueuedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(selectHomeModel(db).topPick?.id).toBe("a");
    db.close();
  });

  it("sorts a null priority last", () => {
    const db = freshDb();
    addItem(db, { id: "1", status: "queued", priority: null });
    addItem(db, { id: "2", status: "queued", priority: 0.1 });
    expect(selectHomeModel(db).topPick?.id).toBe("2");
    db.close();
  });
});

describe("refreshReadingHome", () => {
  it("writes the note under the vault and returns its relpath", () => {
    const db = freshDb();
    addItem(db, { id: "2", status: "queued", priority: 0.9, title: "Winner", estMinutes: 6 });
    addRun(db, "r1", "2", "why two");
    const rel = refreshReadingHome(db, tmp);
    expect(rel).toBe("System/Reading-Home.md");
    const content = fs.readFileSync(path.join(tmp, rel), "utf8");
    expect(content).toContain("You have 1 gem waiting.");
    expect(content).toContain("## Start here");
    expect(content).toContain("[[2|Winner]]");
    expect(content).toContain("Why now: why two");
    expect(content).toContain("Time: 6 min");
    db.close();
  });

  it("omits Start here when nothing is queued", () => {
    const db = freshDb();
    const rel = refreshReadingHome(db, tmp);
    const content = fs.readFileSync(path.join(tmp, rel), "utf8");
    expect(content).toContain("You have 0 gems waiting.");
    expect(content).not.toContain("## Start here");
    db.close();
  });
});
