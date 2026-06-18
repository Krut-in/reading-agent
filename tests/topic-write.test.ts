import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTopicWrite } from "../src/commands/topic-write";
import type { Config } from "../src/config";
import { openDb } from "../src/db/connection";
import { initSchema } from "../src/db/schema";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-topic-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function configFor(dir: string): Config {
  return { vaultRoot: dir, dbPath: path.join(dir, "reading.db") };
}

function seedItems(dir: string, ids: string[]): void {
  const db = openDb(path.join(dir, "reading.db"));
  initSchema(db);
  const insert = db.prepare(
    "INSERT INTO items (id, ft_id, url, canonical_url, title, status) VALUES (?, ?, ?, ?, ?, 'unread')",
  );
  for (const id of ids) {
    const url = `https://x.com/u/status/${id}`;
    insert.run(id, id, url, url, `Title ${id}`);
  }
  db.close();
}

function writeTopic(dir: string, obj: unknown): string {
  const p = path.join(dir, "topic.json");
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

function topicFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    topic: "AI agents",
    summary: "A synthesis.",
    sections: [{ heading: "What the saves say", body: "..." }],
    related_items: [
      { id: "100", title: "Thread A", url: "https://x.com/a/status/100", note: "core take" },
    ],
    sources: [],
    unverified: [],
    ...overrides,
  };
}

describe("runTopicWrite", () => {
  it("writes the note, the topic row, and item_topics for known ids", () => {
    seedItems(tmp, ["100"]);
    const result = runTopicWrite(configFor(tmp), { inputPath: writeTopic(tmp, topicFile()) });
    expect(result.slug).toBe("ai-agents");
    expect(result.notePath).toBe(path.join("Topics", "ai-agents.md"));
    expect(result.linked).toBe(1);
    expect(result.skipped).toEqual([]);

    const note = read(tmp, "Topics/ai-agents.md");
    expect(note).toContain("# AI agents");
    expect(note).toContain('slug: "ai-agents"');

    const topics = rowsOf(tmp, "topics");
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      id: "ai-agents",
      name: "AI agents",
      notes_path: path.join("Topics", "ai-agents.md"),
    });
    expect(rowsOf(tmp, "item_topics")).toHaveLength(1);
  });

  it("is idempotent: a same-input re-run is byte-identical with stable rows", () => {
    seedItems(tmp, ["100"]);
    const input = writeTopic(tmp, topicFile());
    runTopicWrite(configFor(tmp), { inputPath: input });
    const noteA = read(tmp, "Topics/ai-agents.md");
    runTopicWrite(configFor(tmp), { inputPath: input });
    expect(read(tmp, "Topics/ai-agents.md")).toBe(noteA);
    expect(rowsOf(tmp, "topics")).toHaveLength(1);
    expect(rowsOf(tmp, "item_topics")).toHaveLength(1);
  });

  it("updates the summary on re-run and leaves other topics' links intact", () => {
    seedItems(tmp, ["100", "200"]);
    runTopicWrite(configFor(tmp), {
      inputPath: writeTopic(
        tmp,
        topicFile({
          topic: "coding",
          related_items: [{ id: "200", title: "T", url: "https://x.com/b/status/200", note: "n" }],
        }),
      ),
    });
    runTopicWrite(configFor(tmp), { inputPath: writeTopic(tmp, topicFile()) });
    runTopicWrite(configFor(tmp), {
      inputPath: writeTopic(tmp, topicFile({ summary: "Changed synthesis." })),
    });
    expect(read(tmp, "Topics/ai-agents.md")).toContain("Changed synthesis.");
    const links = rowsOf(tmp, "item_topics");
    expect(links.find((l) => l.topic_id === "coding" && l.item_id === "200")).toBeTruthy();
    expect(rowsOf(tmp, "topics")).toHaveLength(2);
  });

  it("skips an unknown related id without throwing and still links the valid ones", () => {
    seedItems(tmp, ["100"]);
    const result = runTopicWrite(configFor(tmp), {
      inputPath: writeTopic(
        tmp,
        topicFile({
          related_items: [
            { id: "100", title: "Known", url: "https://x.com/a/status/100", note: "in db" },
            { id: "999", title: "Unknown", url: "https://x.com/c/status/999", note: "corpus grew" },
          ],
        }),
      ),
    });
    expect(result.skipped).toEqual(["999"]);
    expect(result.linked).toBe(1);
    const note = read(tmp, "Topics/ai-agents.md");
    expect(note).toContain("[Unknown](https://x.com/c/status/999)");
    const links = rowsOf(tmp, "item_topics");
    expect(links).toHaveLength(1);
    expect(links[0]?.item_id).toBe("100");
  });

  it("merges two display names that share a slug (last write wins on name)", () => {
    seedItems(tmp, ["100"]);
    runTopicWrite(configFor(tmp), {
      inputPath: writeTopic(tmp, topicFile({ topic: "AI Agents" })),
    });
    runTopicWrite(configFor(tmp), {
      inputPath: writeTopic(tmp, topicFile({ topic: "AI, agents!" })),
    });
    const topics = rowsOf(tmp, "topics");
    expect(topics).toHaveLength(1);
    expect(topics[0]?.name).toBe("AI, agents!");
  });

  it("honors a --slug override for the id and filename", () => {
    seedItems(tmp, ["100"]);
    const result = runTopicWrite(configFor(tmp), {
      inputPath: writeTopic(tmp, topicFile()),
      slug: "ai-agents-anthropic",
    });
    expect(result.slug).toBe("ai-agents-anthropic");
    expect(fs.existsSync(path.join(tmp, "Topics", "ai-agents-anthropic.md"))).toBe(true);
  });

  it("does not modify Reading-Home", () => {
    seedItems(tmp, ["100"]);
    const homePath = path.join(tmp, "System", "Reading-Home.md");
    fs.mkdirSync(path.dirname(homePath), { recursive: true });
    fs.writeFileSync(homePath, "SENTINEL", "utf8");
    runTopicWrite(configFor(tmp), { inputPath: writeTopic(tmp, topicFile()) });
    expect(fs.readFileSync(homePath, "utf8")).toBe("SENTINEL");
  });

  it("wikilinks a related id that already has an item note on disk", () => {
    seedItems(tmp, ["100"]);
    fs.mkdirSync(path.join(tmp, "Items"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "Items", "100.md"), "# existing", "utf8");
    runTopicWrite(configFor(tmp), { inputPath: writeTopic(tmp, topicFile()) });
    expect(read(tmp, "Topics/ai-agents.md")).toContain("[[100|Thread A]]");
  });

  it("throws on a topic with no slug characters", () => {
    seedItems(tmp, ["100"]);
    expect(() =>
      runTopicWrite(configFor(tmp), { inputPath: writeTopic(tmp, topicFile({ topic: "!!!" })) }),
    ).toThrow(/no slug characters/);
  });

  it("throws when the input file is missing", () => {
    expect(() => runTopicWrite(configFor(tmp), { inputPath: path.join(tmp, "nope.json") })).toThrow(
      /not found/,
    );
  });
});
