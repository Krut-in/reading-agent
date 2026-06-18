import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMark } from "../src/commands/mark";
import type { Config } from "../src/config";
import { openDb } from "../src/db/connection";
import { initSchema } from "../src/db/schema";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-mark-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function configFor(dir: string): Config {
  return { vaultRoot: dir, dbPath: path.join(dir, "reading.db") };
}

function seed(dir: string, items: Array<{ id: string; status: string }>): void {
  const db = openDb(path.join(dir, "reading.db"));
  initSchema(db);
  const insert = db.prepare(
    "INSERT INTO items (id, ft_id, url, canonical_url, title, status) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const item of items) {
    const url = `https://x.com/u/status/${item.id}`;
    insert.run(item.id, item.id, url, url, `Title ${item.id}`, item.status);
  }
  db.close();
}

function statusOf(dir: string, id: string): string {
  const db = openDb(path.join(dir, "reading.db"));
  const row = db.prepare("SELECT status FROM items WHERE id = ?").get(id) as { status: string };
  db.close();
  return row.status;
}

describe("runMark", () => {
  it("marks a queued item read and refreshes Reading-Home", () => {
    seed(tmp, [{ id: "1", status: "queued" }]);
    const result = runMark(configFor(tmp), { id: "1", read: true });
    expect(result.previousStatus).toBe("queued");
    expect(result.newStatus).toBe("read");
    expect(statusOf(tmp, "1")).toBe("read");
    expect(fs.existsSync(path.join(tmp, "System", "Reading-Home.md"))).toBe(true);
  });

  it("marks shared and skipped", () => {
    seed(tmp, [
      { id: "1", status: "queued" },
      { id: "2", status: "unread" },
    ]);
    expect(runMark(configFor(tmp), { id: "1", shared: true }).newStatus).toBe("shared");
    expect(runMark(configFor(tmp), { id: "2", skipped: true }).newStatus).toBe("skipped");
  });

  it("throws when no status flag is given", () => {
    seed(tmp, [{ id: "1", status: "queued" }]);
    expect(() => runMark(configFor(tmp), { id: "1" })).toThrow(/exactly one/);
  });

  it("throws when multiple status flags are given", () => {
    seed(tmp, [{ id: "1", status: "queued" }]);
    expect(() => runMark(configFor(tmp), { id: "1", read: true, shared: true })).toThrow(
      /only one/,
    );
  });

  it("throws on an unknown id and leaves the db untouched", () => {
    seed(tmp, [{ id: "1", status: "queued" }]);
    expect(() => runMark(configFor(tmp), { id: "nope", read: true })).toThrow(/unknown item id/);
    expect(statusOf(tmp, "1")).toBe("queued");
  });

  it("rejects marking an archived item", () => {
    seed(tmp, [{ id: "1", status: "archived" }]);
    expect(() => runMark(configFor(tmp), { id: "1", read: true })).toThrow(/archived/);
  });

  it("treats a same-status mark as a no-op", () => {
    seed(tmp, [{ id: "1", status: "read" }]);
    const result = runMark(configFor(tmp), { id: "1", read: true });
    expect(result.previousStatus).toBe("read");
    expect(result.newStatus).toBe("read");
    expect(statusOf(tmp, "1")).toBe("read");
  });
});
