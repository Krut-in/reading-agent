import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSync } from "../src/commands/sync";
import type { Config } from "../src/config";
import { openDb } from "../src/db/connection";
import { initSchema } from "../src/db/schema";

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "bookmarks.sample.jsonl");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-sync-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function configFor(dir: string): Config {
  return { vaultRoot: dir, dbPath: path.join(dir, "reading.db") };
}

function seedDb(dir: string): void {
  const db = openDb(path.join(dir, "reading.db"));
  initSchema(db);
  db.close();
}

describe("runSync", () => {
  it("ingests a JSONL dump via --manual and refreshes Reading-Home", async () => {
    seedDb(tmp);
    const result = await runSync(configFor(tmp), { manual: FIXTURE });
    expect(result.sourceId).toBe("manual-export");
    // The fixture is 3 records, two distinct after canonical dedup (100 and 100/ collide).
    expect(result.total).toBe(3);
    expect(result.inserted).toBe(2);
    expect(result.existing).toBe(1);
    expect(result.homeWritten).toBe("System/Reading-Home.md");
    const home = fs.readFileSync(path.join(tmp, "System", "Reading-Home.md"), "utf8");
    // Nothing curated yet, so the gem count is zero even though the backlog has items.
    expect(home).toContain("You have 0 gems waiting.");
  });

  it("is idempotent on a second --manual ingest", async () => {
    seedDb(tmp);
    const first = await runSync(configFor(tmp), { manual: FIXTURE });
    expect(first.inserted).toBe(2);
    const second = await runSync(configFor(tmp), { manual: FIXTURE });
    expect(second.inserted).toBe(0);
    expect(second.existing).toBe(3);
  });

  it("rejects --manual combined with --pull", async () => {
    seedDb(tmp);
    await expect(runSync(configFor(tmp), { manual: FIXTURE, pull: true })).rejects.toThrow(
      /--manual cannot be combined with --pull/,
    );
  });
});
