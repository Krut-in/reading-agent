import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../src/clock";
import { runWrite } from "../src/commands/write";
import type { Config } from "../src/config";
import { openDb } from "../src/db/connection";
import { initSchema } from "../src/db/schema";

let tmp: string;

// A local-component date, so localDateStamp is the same in every runner timezone.
const CLOCK: Clock = { now: () => new Date(2026, 5, 9, 12, 0, 0) };
const DATE = "2026-06-09";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-write-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function configFor(dir: string): Config {
  return { vaultRoot: dir, dbPath: path.join(dir, "reading.db") };
}

function seedItems(
  dir: string,
  items: Array<{ id: string; status?: string; title?: string }>,
): void {
  const db = openDb(path.join(dir, "reading.db"));
  initSchema(db);
  const insert = db.prepare(
    "INSERT INTO items (id, ft_id, url, canonical_url, title, status, bookmarked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const item of items) {
    const url = `https://x.com/u/status/${item.id}`;
    insert.run(
      item.id,
      item.id,
      url,
      url,
      item.title ?? `Title ${item.id}`,
      item.status ?? "unread",
      null,
    );
  }
  db.close();
}

function pickFor(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    selected_for: "now",
    content_type: "thread",
    estimated_time_minutes: 6,
    priority_score: 0.5,
    usefulness_score: 0.5,
    interest_score: 0.5,
    popularity_score: 0.5,
    recency_score: 0.5,
    topics: ["AI agents"],
    tags: [],
    hook: `hook for ${id}`,
    pitch: {
      curiosity: `curiosity ${id}`,
      why_picked: "w",
      what_you_may_learn: "l",
      bookmark_context: "b",
      linked_resource_summary: "r",
      source_context: "s",
    },
    ...overrides,
  };
}

function writePicks(dir: string, obj: unknown): string {
  const p = path.join(dir, "picks.json");
  fs.writeFileSync(p, JSON.stringify(obj), "utf8");
  return p;
}

function read(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, rel), "utf8");
}

function rowsOf(dir: string, table: string): Array<Record<string, unknown>> {
  const db = openDb(path.join(dir, "reading.db"));
  const out = db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
  db.close();
  return out;
}

describe("runWrite kind=now", () => {
  it("queues the picks, writes notes, records the run, and refreshes Home", () => {
    seedItems(tmp, [
      { id: "100", title: "Alpha thread" },
      { id: "200", title: "Beta thread" },
    ]);
    const picks = writePicks(tmp, {
      kind: "now",
      picks: [pickFor("100", { priority_score: 0.9 }), pickFor("200", { priority_score: 0.3 })],
    });

    const result = runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK });
    expect(result.runId).toBe("now-2026-06-09");
    expect(result.queued).toBe(2);
    expect(result.reused).toBe(0);

    const items = rowsOf(tmp, "items");
    for (const id of ["100", "200"]) {
      const row = items.find((r) => r.id === id);
      expect(row?.status).toBe("queued");
      expect(row?.last_queued_at).toBeTruthy();
      expect(row?.content_type).toBe("thread");
      expect(row?.priority_score).not.toBeNull();
      expect(row?.estimated_time_minutes).toBe(6);
    }

    const note = read(tmp, "Items/100.md");
    expect(note).toContain("# Alpha thread");
    expect(note).toContain('status: "queued"');
    expect(note).toContain("## Curiosity Pitch\ncuriosity 100");

    const readNow = read(tmp, `Daily/${DATE}-read-now.md`);
    expect(readNow).toContain(`# Read Now - ${DATE}`);
    expect(readNow).toContain("[[100|Alpha thread]]");

    expect(rowsOf(tmp, "curation_runs")).toHaveLength(1);
    const runItems = rowsOf(tmp, "run_items");
    expect(runItems).toHaveLength(2);
    expect(runItems.find((r) => r.item_id === "100")?.reason).toBe("hook for 100");

    const home = read(tmp, "System/Reading-Home.md");
    expect(home).toContain("You have 2 gems waiting.");
    expect(home).toContain("[[100|Alpha thread]]"); // higher priority is the top pick
  });

  it("keeps reading.db thin: prose lives only in the note", () => {
    seedItems(tmp, [{ id: "100" }]);
    const picks = writePicks(tmp, { kind: "now", picks: [pickFor("100")] });
    runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK });

    const dump = JSON.stringify({
      items: rowsOf(tmp, "items"),
      runItems: rowsOf(tmp, "run_items"),
    });
    expect(dump).not.toContain("curiosity 100");
    const reason = rowsOf(tmp, "run_items").find((r) => r.item_id === "100")?.reason as string;
    expect(reason).toBe("hook for 100");
    expect(reason).not.toContain("\n");
  });

  it("is idempotent: a same-payload re-run is byte-identical with one run row", () => {
    seedItems(tmp, [{ id: "100" }, { id: "200" }]);
    const picks = writePicks(tmp, { kind: "now", picks: [pickFor("100"), pickFor("200")] });

    runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK });
    const noteA = read(tmp, "Items/100.md");
    const queueA = read(tmp, `Daily/${DATE}-read-now.md`);
    const homeA = read(tmp, "System/Reading-Home.md");

    const second = runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK });
    expect(second.reused).toBe(2);
    expect(read(tmp, "Items/100.md")).toBe(noteA);
    expect(read(tmp, `Daily/${DATE}-read-now.md`)).toBe(queueA);
    expect(read(tmp, "System/Reading-Home.md")).toBe(homeA);
    expect(rowsOf(tmp, "curation_runs")).toHaveLength(1);
    expect(rowsOf(tmp, "run_items")).toHaveLength(2);
  });

  it("overwrites the item note when the pitch changes", () => {
    seedItems(tmp, [{ id: "100" }]);
    runWrite(configFor(tmp), {
      picksPath: writePicks(tmp, { kind: "now", picks: [pickFor("100")] }),
      clock: CLOCK,
    });
    runWrite(configFor(tmp), {
      picksPath: writePicks(tmp, {
        kind: "now",
        picks: [
          pickFor("100", { pitch: { ...(pickFor("100").pitch as object), curiosity: "changed" } }),
        ],
      }),
      clock: CLOCK,
    });
    expect(read(tmp, "Items/100.md")).toContain("## Curiosity Pitch\nchanged");
  });
});

describe("runWrite kind=prepared", () => {
  it("writes a grouped prepared-queue note and no read-now note", () => {
    seedItems(tmp, [
      { id: "1", title: "Light" },
      { id: "2", title: "Deep" },
    ]);
    const picks = writePicks(tmp, {
      kind: "prepared",
      picks: [
        pickFor("1", { selected_for: "prepared", group: "Lighter", estimated_time_minutes: 4 }),
        pickFor("2", { selected_for: "prepared", group: "Deeper", estimated_time_minutes: 12 }),
      ],
    });
    const result = runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK });
    expect(result.queueNoteWritten).toBe(`Daily/${DATE}.md`);

    const note = read(tmp, `Daily/${DATE}.md`);
    expect(note).toContain("## Lighter");
    expect(note).toContain("## Deeper");
    expect(note).toContain("[[1|Light]]");
    expect(fs.existsSync(path.join(tmp, "Daily", `${DATE}-read-now.md`))).toBe(false);
  });
});

describe("runWrite kind=resurface", () => {
  it("writes its own resurface note, not the read-now note, and queues the picks as gems", () => {
    seedItems(tmp, [
      { id: "100", title: "Old gem" },
      { id: "200", title: "Older gem" },
    ]);
    const picks = writePicks(tmp, {
      kind: "resurface",
      picks: [
        pickFor("100", { selected_for: "resurface", priority_score: 0.9 }),
        pickFor("200", { selected_for: "resurface", priority_score: 0.3 }),
      ],
    });
    const result = runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK });
    expect(result.runId).toBe("resurface-2026-06-09");
    expect(result.queueNoteWritten).toBe(`Daily/${DATE}-resurface.md`);

    const note = read(tmp, `Daily/${DATE}-resurface.md`);
    expect(note).toContain(`# Resurfaced - ${DATE}`);
    expect(note).toContain("[[100|Old gem]]");
    expect(fs.existsSync(path.join(tmp, "Daily", `${DATE}-read-now.md`))).toBe(false);

    for (const id of ["100", "200"]) {
      expect(rowsOf(tmp, "items").find((r) => r.id === id)?.status).toBe("queued");
    }
    expect(read(tmp, "System/Reading-Home.md")).toContain("You have 2 gems waiting.");
  });

  it("coexists with a same-day read-now run: distinct notes and two runs", () => {
    seedItems(tmp, [
      { id: "100", title: "Now item" },
      { id: "200", title: "Resurfaced item" },
    ]);
    runWrite(configFor(tmp), {
      picksPath: writePicks(tmp, { kind: "now", picks: [pickFor("100")] }),
      clock: CLOCK,
    });
    runWrite(configFor(tmp), {
      picksPath: writePicks(tmp, {
        kind: "resurface",
        picks: [pickFor("200", { selected_for: "resurface" })],
      }),
      clock: CLOCK,
    });
    expect(fs.existsSync(path.join(tmp, "Daily", `${DATE}-read-now.md`))).toBe(true);
    expect(fs.existsSync(path.join(tmp, "Daily", `${DATE}-resurface.md`))).toBe(true);
    expect(rowsOf(tmp, "curation_runs")).toHaveLength(2);
  });
});

describe("runWrite fail-closed", () => {
  it("rejects an unknown id and writes nothing", () => {
    seedItems(tmp, [{ id: "100" }]);
    const picks = writePicks(tmp, { kind: "now", picks: [pickFor("nope")] });
    expect(() => runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK })).toThrow(
      /unknown item id/,
    );
    expect(fs.existsSync(path.join(tmp, "Items"))).toBe(false);
    expect(rowsOf(tmp, "curation_runs")).toHaveLength(0);
  });

  it("refuses to re-queue an already-read item and leaves state untouched", () => {
    seedItems(tmp, [{ id: "100", status: "read" }]);
    const picks = writePicks(tmp, { kind: "now", picks: [pickFor("100")] });
    expect(() => runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK })).toThrow(
      /cannot queue 100/,
    );
    expect(rowsOf(tmp, "items").find((r) => r.id === "100")?.status).toBe("read");
    expect(fs.existsSync(path.join(tmp, "Items", "100.md"))).toBe(false);
  });

  it("rejects an empty picks file", () => {
    seedItems(tmp, [{ id: "100" }]);
    const picks = writePicks(tmp, { kind: "now", picks: [] });
    expect(() => runWrite(configFor(tmp), { picksPath: picks, clock: CLOCK })).toThrow(
      /non-empty array/,
    );
  });

  it("throws when the picks file is missing", () => {
    expect(() =>
      runWrite(configFor(tmp), { picksPath: path.join(tmp, "nope.json"), clock: CLOCK }),
    ).toThrow(/not found/);
  });
});
