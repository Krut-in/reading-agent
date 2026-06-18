import { describe, expect, it } from "vitest";
import { type ItemNoteModel, renderItemNote } from "../src/render/item-note";

function model(overrides: Partial<ItemNoteModel> = {}): ItemNoteModel {
  return {
    id: "100",
    status: "queued",
    source: "x",
    url: "https://x.com/alpha/status/100",
    canonicalUrl: "https://x.com/alpha/status/100",
    title: "Why AI agents need a judgment layer",
    contentType: "thread",
    topics: ["AI agents"],
    tags: ["#agents"],
    priorityScore: 0.82,
    usefulnessScore: 0.9,
    interestScore: 0.8,
    popularityScore: 0.7,
    recencyScore: 0.6,
    estimatedTimeMinutes: 6,
    bookmarkedAt: null,
    lastQueuedAt: "2026-06-09T17:40:00.000Z",
    selectedFor: "now",
    hook: "why now",
    pitch: {
      curiosity: "curiosity text",
      why_picked: "why text",
      what_you_may_learn: "learn text",
      bookmark_context: "bookmark text",
      linked_resource_summary: "resource text",
      source_context: "source text",
    },
    related: [],
    ...overrides,
  };
}

function frontmatterKeys(note: string): string[] {
  const start = note.indexOf("---");
  const end = note.indexOf("---", start + 3);
  return note
    .slice(start, end)
    .split("\n")
    .filter((line) => line.includes(":"))
    .map((line) => line.split(":")[0].trim());
}

describe("renderItemNote", () => {
  it("emits frontmatter in PLAN field order", () => {
    const keys = frontmatterKeys(renderItemNote(model()));
    expect(keys.slice(0, 6)).toEqual(["id", "status", "source", "url", "canonical_url", "title"]);
    expect(keys).toContain("selected_for");
  });

  it("renders all body sections in PLAN order", () => {
    const out = renderItemNote(model());
    const order = [
      "## Curiosity Pitch",
      "## Why This Was Picked",
      "## What You May Learn",
      "## Bookmark Context",
      "## Linked Resource Summary",
      "## Source Context",
      "## Related Items",
      "## Notes",
      "## Source",
    ];
    // Search with the trailing newline so "## Source" does not match inside "## Source Context".
    let last = -1;
    for (const heading of order) {
      const at = out.indexOf(`${heading}\n`);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });

  it("includes the title heading and the visual checkboxes", () => {
    const out = renderItemNote(model());
    expect(out).toContain("# Why AI agents need a judgment layer");
    expect(out).toContain("- [ ] Read");
    expect(out).toContain("- [ ] Share");
  });

  it("renders related items as wikilinks", () => {
    const out = renderItemNote(model({ related: [{ id: "200", title: "Related thread" }] }));
    expect(out).toContain("- [[200|Related thread]]");
  });

  it("shows the source url and drops a canonical line equal to the url", () => {
    const out = renderItemNote(model());
    expect(out).toContain("- Original: https://x.com/alpha/status/100");
    expect(out).not.toContain("- Canonical:");
  });

  it("shows a canonical line when it differs from the url", () => {
    const out = renderItemNote(model({ canonicalUrl: "https://example.com/a" }));
    expect(out).toContain("- Canonical: https://example.com/a");
  });

  it("emits null for a null bookmarked_at", () => {
    expect(renderItemNote(model())).toContain("bookmarked_at: null");
  });

  it("is byte-stable across renders", () => {
    expect(renderItemNote(model())).toBe(renderItemNote(model()));
  });
});
