import { describe, expect, it } from "vitest";
import { type TopicNoteModel, renderTopicNote } from "../src/render/topic-note";

function model(overrides: Partial<TopicNoteModel> = {}): TopicNoteModel {
  return {
    topic: "AI agents",
    slug: "ai-agents",
    summary: "A short synthesis of the saves.",
    sections: [
      { heading: "What the saves say", body: "Several saves argue for a judgment layer." },
    ],
    related: [],
    sources: [],
    unverified: [],
    ...overrides,
  };
}

describe("renderTopicNote", () => {
  it("renders frontmatter, title, summary, and sections", () => {
    const out = renderTopicNote(model());
    expect(out).toContain('topic: "AI agents"');
    expect(out).toContain('slug: "ai-agents"');
    expect(out).toContain('type: "topic"');
    expect(out).toContain("# AI agents");
    expect(out).toContain("A short synthesis of the saves.");
    expect(out).toContain("## What the saves say");
  });

  it("wikilinks a related item that has a note and plain-links one that does not", () => {
    const out = renderTopicNote(
      model({
        related: [
          {
            id: "100",
            title: "Curated thread",
            url: "https://x.com/a/status/100",
            note: "core take",
            hasNote: true,
          },
          {
            id: "200",
            title: "Uncurated thread",
            url: "https://x.com/b/status/200",
            note: "context",
            hasNote: false,
          },
        ],
      }),
    );
    expect(out).toContain("- [[100|Curated thread]] (core take)");
    expect(out).toContain("- [Uncurated thread](https://x.com/b/status/200) (context)");
  });

  it("renders sources with corroboration and an unverified section", () => {
    const out = renderTopicNote(
      model({
        sources: [
          {
            title: "Launch post",
            url: "https://example.com/a",
            publisher: "Example",
            claim: "X shipped Y on June 1",
            corroborated_by: ["https://example.com/b", "https://example.com/c"],
          },
        ],
        unverified: ["the exact price"],
      }),
    );
    expect(out).toContain("- X shipped Y on June 1");
    expect(out).toContain("- Source: [Launch post](https://example.com/a), Example");
    expect(out).toContain(
      "- Corroborated by: [1](https://example.com/b), [2](https://example.com/c)",
    );
    expect(out).toContain("## Could Not Verify");
    expect(out).toContain("- the exact price");
  });

  it("uses placeholders when related, sources, and unverified are empty", () => {
    const out = renderTopicNote(model());
    expect(out).toContain("## Related Saved Items\n- (none)");
    expect(out).toContain("## Sources\n- (none)");
    expect(out).toContain("- Nothing flagged this pass.");
  });
});
