import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { type Classification, buildCandidates } from "../src/candidates";
import { initSchema } from "../src/db/schema";
import { recordDeltas } from "../src/ingest";
import { type RawBookmark, parseBookmarksJsonl } from "../src/source/types";

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "bookmarks.sample.jsonl");

function corpus() {
  return parseBookmarksJsonl(fs.readFileSync(FIXTURE, "utf8")).bookmarks;
}

function seededDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  recordDeltas(db, corpus());
  return db;
}

const SHARED_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "shared-resource.sample.jsonl",
);

function sharedCorpus() {
  return parseBookmarksJsonl(fs.readFileSync(SHARED_FIXTURE, "utf8")).bookmarks;
}

function sharedDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  recordDeltas(db, sharedCorpus());
  return db;
}

const fixedClock = { now: () => new Date("2026-06-18T20:00:00Z") };

describe("buildCandidates", () => {
  it("returns unread items enriched from the corpus, newest first", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus());
    expect(candidates.map((c) => c.ft_id)).toEqual(["100", "200"]);

    const beta = candidates.find((c) => c.ft_id === "200");
    expect(beta?.links).toContain("http://x.com/i/article/200");
    expect(beta?.mediaTypes).toEqual(["photo"]);
    expect(beta?.status).toBe("unread");
    expect(beta?.engagement?.likeCount).toBe(120);
    db.close();
  });

  it("excludes items that are no longer unread", () => {
    const db = seededDb();
    db.prepare("UPDATE items SET status = 'read' WHERE ft_id = '100'").run();
    const candidates = buildCandidates(db, corpus());
    expect(candidates.map((c) => c.ft_id)).toEqual(["200"]);
    db.close();
  });

  it("honors the limit", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus(), { limit: 1 });
    expect(candidates.length).toBe(1);
    expect(candidates[0]?.ft_id).toBe("100");
    db.close();
  });

  it("orders oldest first when asked (for resurfacing)", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus(), { order: "oldest" });
    expect(candidates.map((c) => c.ft_id)).toEqual(["200", "100"]);
    db.close();
  });

  it("treats an explicit newest order the same as the default", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus(), { order: "newest" });
    expect(candidates.map((c) => c.ft_id)).toEqual(["100", "200"]);
    db.close();
  });

  it("keeps only items posted strictly before the cutoff by instant, not string", () => {
    // 100 was posted Jun 08 20:00 UTC, so before=2026-06-08 (UTC midnight) excludes it even though
    // the calendar day matches; 200 (Jun 07) survives. A naive string compare on the Twitter date
    // would be wrong here.
    const db = seededDb();
    const candidates = buildCandidates(db, corpus(), { before: "2026-06-08" });
    expect(candidates.map((c) => c.ft_id)).toEqual(["200"]);
    db.close();
  });

  it("combines before, oldest, and limit as filter then sort then slice", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus(), {
      before: "2030-01-01",
      order: "oldest",
      limit: 1,
    });
    expect(candidates.map((c) => c.ft_id)).toEqual(["200"]);
    db.close();
  });

  it("drops items with a missing postedAt under a before filter", () => {
    const noDate: RawBookmark = {
      id: "400",
      url: "https://x.com/d/status/400",
      text: "no posted date",
      author: { handle: "d" },
      links: [],
      mediaObjects: [],
      tags: [],
    };
    const all = [...corpus(), noDate];
    const db = new Database(":memory:");
    initSchema(db);
    recordDeltas(db, all);
    const candidates = buildCandidates(db, all, { before: "2030-01-01" });
    expect(candidates.map((c) => c.ft_id)).toEqual(["100", "200"]);
    db.close();
  });

  it("rejects an invalid before date", () => {
    const db = seededDb();
    expect(() => buildCandidates(db, corpus(), { before: "not-a-date" })).toThrow(/invalid before/);
    db.close();
  });
});

describe("buildCandidates: ageDays", () => {
  it("computes whole days from postedAt against the injected clock", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus(), {}, { clock: fixedClock });
    // 100 posted Jun 08 20:00Z, clock Jun 18 20:00Z => exactly 10 days.
    expect(candidates.find((c) => c.ft_id === "100")?.ageDays).toBe(10);
    // 200 posted Jun 07 10:00Z => 11 days 10 hours => floor 11.
    expect(candidates.find((c) => c.ft_id === "200")?.ageDays).toBe(11);
    db.close();
  });

  it("orders newest first, so the newest item has the smallest ageDays", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus(), {}, { clock: fixedClock });
    expect(candidates[0]?.ft_id).toBe("100");
    expect(candidates[0]?.ageDays).toBeLessThan(candidates[1]?.ageDays ?? Number.POSITIVE_INFINITY);
    db.close();
  });

  it("is null when postedAt is missing", () => {
    const noDate: RawBookmark = {
      id: "400",
      url: "https://x.com/d/status/400",
      text: "no posted date",
      author: { handle: "d" },
      links: [],
      mediaObjects: [],
      tags: [],
    };
    const all = [...corpus(), noDate];
    const db = new Database(":memory:");
    initSchema(db);
    recordDeltas(db, all);
    const candidates = buildCandidates(db, all, {}, { clock: fixedClock });
    expect(candidates.find((c) => c.ft_id === "400")?.ageDays).toBeNull();
    db.close();
  });
});

describe("buildCandidates: same-resource signal", () => {
  it("clusters two items sharing a canonical resource across a host-case variant", () => {
    const db = sharedDb();
    const candidates = buildCandidates(db, sharedCorpus());
    expect(
      candidates.find((c) => c.ft_id === "R1")?.sharedResourceWith.map((s) => s.ft_id),
    ).toEqual(["R2"]);
    expect(
      candidates.find((c) => c.ft_id === "R2")?.sharedResourceWith.map((s) => s.ft_id),
    ).toEqual(["R1"]);
    db.close();
  });

  it("canonicalizes resourceKeys (uppercase host folds to lowercase)", () => {
    const db = sharedDb();
    const candidates = buildCandidates(db, sharedCorpus());
    const r1 = candidates.find((c) => c.ft_id === "R1");
    expect(r1?.resourceKeys).toContain("http://agents.md");
    expect(r1?.resourceKeys).toContain("https://example.com/threads/T-x");
    db.close();
  });

  it("leaves a link-unique item with an empty cluster", () => {
    const db = sharedDb();
    const candidates = buildCandidates(db, sharedCorpus());
    const r3 = candidates.find((c) => c.ft_id === "R3");
    expect(r3?.resourceKeys).toEqual(["https://example.com/unique"]);
    expect(r3?.sharedResourceWith).toEqual([]);
    db.close();
  });

  it("surfaces an already-read partner with its status", () => {
    const db = sharedDb();
    db.prepare("UPDATE items SET status = 'read' WHERE ft_id = 'R2'").run();
    const candidates = buildCandidates(db, sharedCorpus());
    expect(candidates.find((c) => c.ft_id === "R1")?.sharedResourceWith).toEqual([
      { ft_id: "R2", status: "read" },
    ]);
    // R2 is read, so it is not itself a candidate.
    expect(candidates.map((c) => c.ft_id)).not.toContain("R2");
    db.close();
  });

  it("gives a link-free item an empty cluster", () => {
    const db = seededDb();
    const candidates = buildCandidates(db, corpus());
    expect(candidates.find((c) => c.ft_id === "100")?.resourceKeys).toEqual([]);
    expect(candidates.find((c) => c.ft_id === "100")?.sharedResourceWith).toEqual([]);
    db.close();
  });
});

describe("buildCandidates: classification join", () => {
  it("joins category and domain by ft_id and leaves a missing id null", () => {
    const db = seededDb();
    const classification = new Map<string, Classification>([
      [
        "100",
        {
          primaryCategory: "tool",
          categories: ["tool", "technique"],
          primaryDomain: "ai",
          domains: ["ai"],
        },
      ],
    ]);
    const candidates = buildCandidates(db, corpus(), {}, { classification });
    const a = candidates.find((c) => c.ft_id === "100");
    const b = candidates.find((c) => c.ft_id === "200");
    expect(a?.primaryCategory).toBe("tool");
    expect(a?.categories).toEqual(["tool", "technique"]);
    expect(a?.primaryDomain).toBe("ai");
    expect(b?.primaryCategory).toBeNull();
    expect(b?.categories).toEqual([]);
    expect(b?.domains).toEqual([]);
    db.close();
  });

  it("defaults category fields to null/empty when no classification is supplied", () => {
    const db = seededDb();
    const a = buildCandidates(db, corpus()).find((c) => c.ft_id === "100");
    expect(a?.primaryCategory).toBeNull();
    expect(a?.categories).toEqual([]);
    expect(a?.primaryDomain).toBeNull();
    expect(a?.domains).toEqual([]);
    db.close();
  });
});
