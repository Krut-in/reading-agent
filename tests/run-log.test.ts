import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRunLog } from "../src/commands/run-log";
import type { Config } from "../src/config";
import { openDb } from "../src/db/connection";
import { initSchema } from "../src/db/schema";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-runlog-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function configFor(dir: string): Config {
  return { vaultRoot: dir, dbPath: path.join(dir, "reading.db") };
}

interface RunSeed {
  id: string;
  kind: string;
  createdAt: string;
  summary?: string | null;
  itemIds: string[];
}

function seed(dir: string, runs: RunSeed[]): void {
  const db = openDb(path.join(dir, "reading.db"));
  initSchema(db);
  const insertItem = db.prepare(
    "INSERT OR IGNORE INTO items (id, ft_id, url, canonical_url, title, status) VALUES (?, ?, ?, ?, ?, 'queued')",
  );
  const insertRun = db.prepare(
    "INSERT INTO curation_runs (id, kind, created_at, summary) VALUES (?, ?, ?, ?)",
  );
  const insertRunItem = db.prepare(
    "INSERT INTO run_items (run_id, item_id, selected_for, reason) VALUES (?, ?, 'now', ?)",
  );
  for (const r of runs) {
    insertRun.run(r.id, r.kind, r.createdAt, r.summary ?? null);
    for (const itemId of r.itemIds) {
      const url = `https://x.com/u/status/${itemId}`;
      insertItem.run(itemId, itemId, url, url, `Title ${itemId}`);
      insertRunItem.run(r.id, itemId, `reason ${itemId}`);
    }
  }
  db.close();
}

describe("runRunLog", () => {
  it("returns an empty list when there are no runs", () => {
    seed(tmp, []);
    expect(runRunLog(configFor(tmp))).toEqual([]);
  });

  it("lists runs newest first with item counts", () => {
    seed(tmp, [
      {
        id: "now-2026-06-08",
        kind: "now",
        createdAt: "2026-06-08T10:00:00.000Z",
        summary: "now: 2 items",
        itemIds: ["a", "b"],
      },
      {
        id: "prepared-2026-06-09",
        kind: "prepared",
        createdAt: "2026-06-09T10:00:00.000Z",
        summary: "prepared: 1 item",
        itemIds: ["c"],
      },
    ]);

    const log = runRunLog(configFor(tmp));
    expect(log.map((r) => r.id)).toEqual(["prepared-2026-06-09", "now-2026-06-08"]);

    const prepared = log.find((r) => r.id === "prepared-2026-06-09");
    expect(prepared?.kind).toBe("prepared");
    expect(prepared?.itemCount).toBe(1);

    const now = log.find((r) => r.id === "now-2026-06-08");
    expect(now?.itemCount).toBe(2);
    expect(now?.summary).toBe("now: 2 items");
  });

  it("honors --limit, keeping the most recent runs", () => {
    seed(tmp, [
      { id: "r1", kind: "now", createdAt: "2026-06-01T00:00:00.000Z", itemIds: ["a"] },
      { id: "r2", kind: "now", createdAt: "2026-06-02T00:00:00.000Z", itemIds: ["b"] },
      { id: "r3", kind: "now", createdAt: "2026-06-03T00:00:00.000Z", itemIds: ["c"] },
    ]);
    const log = runRunLog(configFor(tmp), { limit: 2 });
    expect(log.map((r) => r.id)).toEqual(["r3", "r2"]);
  });
});
