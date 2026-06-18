import { describe, expect, it } from "vitest";
import { parseTopicFile } from "../src/topic";

function valid(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    topic: "AI agents",
    summary: "A short synthesis.",
    sections: [{ heading: "What the saves say", body: "..." }],
    related_items: [
      { id: "100", title: "A thread", url: "https://x.com/a/status/100", note: "core take" },
    ],
    sources: [
      {
        title: "Launch post",
        url: "https://example.com/a",
        publisher: "Example",
        claim: "X shipped Y",
        corroborated_by: ["https://example.com/b"],
      },
    ],
    unverified: ["a price I could not confirm"],
    ...overrides,
  });
}

describe("parseTopicFile", () => {
  it("parses a well-formed topic file", () => {
    const t = parseTopicFile(valid());
    expect(t.topic).toBe("AI agents");
    expect(t.sections).toHaveLength(1);
    expect(t.related_items[0]?.id).toBe("100");
    expect(t.sources[0]?.corroborated_by).toEqual(["https://example.com/b"]);
    expect(t.unverified).toHaveLength(1);
  });

  it("accepts an optional slug and empty collections", () => {
    const t = parseTopicFile(
      valid({
        slug: "ai-agents-anthropic",
        sections: [],
        related_items: [],
        sources: [],
        unverified: [],
      }),
    );
    expect(t.slug).toBe("ai-agents-anthropic");
    expect(t.sections).toEqual([]);
  });

  it("rejects an empty topic", () => {
    expect(() => parseTopicFile(valid({ topic: "  " }))).toThrow(/topic must not be empty/);
  });

  it("rejects an empty slug when present", () => {
    expect(() => parseTopicFile(valid({ slug: "" }))).toThrow(/slug must not be empty/);
  });

  it("rejects a malformed section", () => {
    expect(() => parseTopicFile(valid({ sections: [{ body: "no heading" }] }))).toThrow(
      /sections\[0\]\.heading/,
    );
  });

  it("rejects a related item missing a url", () => {
    expect(() =>
      parseTopicFile(valid({ related_items: [{ id: "1", title: "t", note: "n" }] })),
    ).toThrow(/related_items\[0\]\.url/);
  });

  it("rejects a source missing a claim", () => {
    expect(() =>
      parseTopicFile(
        valid({
          sources: [{ title: "t", url: "https://e.com", publisher: "p", corroborated_by: [] }],
        }),
      ),
    ).toThrow(/sources\[0\]\.claim/);
  });

  it("rejects corroborated_by that is not a string array", () => {
    expect(() =>
      parseTopicFile(
        valid({
          sources: [
            {
              title: "t",
              url: "https://e.com",
              publisher: "p",
              claim: "c",
              corroborated_by: "nope",
            },
          ],
        }),
      ),
    ).toThrow(/corroborated_by/);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseTopicFile("{not json")).toThrow(/not valid JSON/);
  });
});
