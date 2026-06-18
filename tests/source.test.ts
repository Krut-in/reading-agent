import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FieldTheorySource } from "../src/source/field-theory";
import { ManualExportSource } from "../src/source/manual-export";
import { parseBookmarksJsonl } from "../src/source/types";

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "bookmarks.sample.jsonl");

describe("parseBookmarksJsonl", () => {
  it("parses good lines and skips malformed or incomplete ones", () => {
    const text = `${fs.readFileSync(FIXTURE, "utf8")}\nnot json\n{}\n`;
    const { bookmarks, errors } = parseBookmarksJsonl(text);
    expect(bookmarks.length).toBe(3);
    expect(errors).toBeGreaterThanOrEqual(2);
  });
});

describe("ManualExportSource", () => {
  it("reads a jsonl dump in the Field Theory shape", async () => {
    const source = new ManualExportSource(FIXTURE);
    const list = await source.list();
    expect(list.map((b) => b.id).sort()).toEqual(["100", "200", "300"]);
    expect(list.find((b) => b.id === "200")?.links).toContain("http://x.com/i/article/200");
  });

  it("rejects CSV for now with a clear message", async () => {
    const source = new ManualExportSource("/tmp/whatever.csv");
    await expect(source.list()).rejects.toThrow(/CSV/);
  });
});

describe("FieldTheorySource", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ft-src-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reads bookmarks.jsonl from a data dir override", async () => {
    fs.copyFileSync(FIXTURE, path.join(tmp, "bookmarks.jsonl"));
    const source = new FieldTheorySource({ dataDir: tmp });
    const list = await source.list();
    expect(list.length).toBe(3);
  });

  it("throws a clear error when bookmarks.jsonl is absent", async () => {
    const source = new FieldTheorySource({ dataDir: tmp });
    await expect(source.list()).rejects.toThrow(/bookmarks\.jsonl not found/);
  });
});
