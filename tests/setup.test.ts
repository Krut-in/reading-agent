import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSetup } from "../src/commands/setup";
import type { Config } from "../src/config";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-setup-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function configFor(dir: string): Config {
  return { vaultRoot: dir, dbPath: path.join(dir, "reading.db") };
}

describe("runSetup", () => {
  it("renders a dynamic Reading-Home in the zero-gem state", () => {
    const result = runSetup(configFor(tmp));
    expect(result.homeWritten).toBe("System/Reading-Home.md");
    const content = fs.readFileSync(path.join(tmp, "System", "Reading-Home.md"), "utf8");
    expect(content).toContain("You have 0 gems waiting.");
    expect(content).not.toContain("## Start here");
  });

  it("creates the schema, seed files, and vault folders", () => {
    const result = runSetup(configFor(tmp));
    expect(result.schemaVersion).toBeGreaterThan(0);
    expect(result.filesCreated).toContain("System/sources.md");
    expect(fs.existsSync(path.join(tmp, "reading.db"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, "Items"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, "System"))).toBe(true);
  });

  it("never treats Reading-Home as a seeded static file", () => {
    const first = runSetup(configFor(tmp));
    expect(first.filesCreated).not.toContain("System/Reading-Home.md");
    const second = runSetup(configFor(tmp));
    expect(second.filesExisting).not.toContain("System/Reading-Home.md");
  });

  it("is idempotent on a re-run and still refreshes Reading-Home", () => {
    runSetup(configFor(tmp));
    const second = runSetup(configFor(tmp));
    expect(second.filesCreated).toHaveLength(0);
    expect(second.filesExisting).toContain("System/sources.md");
    expect(second.homeWritten).toBe("System/Reading-Home.md");
  });
});
