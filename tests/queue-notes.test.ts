import { describe, expect, it } from "vitest";
import {
  type PreparedGroup,
  type QueueEntry,
  renderPreparedQueueNote,
  renderReadNowNote,
  renderResurfaceNote,
} from "../src/render/queue-notes";

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: "100",
    title: "A thread",
    hook: "why now",
    estimatedTimeMinutes: 6,
    topics: ["AI agents"],
    ...overrides,
  };
}

describe("renderReadNowNote", () => {
  it("writes a dated header and a block per entry", () => {
    const out = renderReadNowNote("2026-06-09", [entry(), entry({ id: "200", title: "Another" })]);
    expect(out).toContain("# Read Now - 2026-06-09");
    expect(out).toContain("- [ ] Read: [[100|A thread]]");
    expect(out).toContain("- [ ] Share: [[100|A thread]]");
    expect(out).toContain("  - Topic: AI agents");
    expect(out).toContain("  - Time: 6 min");
    expect(out).toContain("  - Curiosity: why now");
    expect(out).toContain("[[200|Another]]");
  });

  it("shows unknown time and a bare Topic line when those are missing", () => {
    const out = renderReadNowNote("2026-06-09", [
      entry({ estimatedTimeMinutes: null, topics: [] }),
    ]);
    expect(out).toContain("  - Time: unknown");
    expect(out).toContain("  - Topic:\n");
  });
});

describe("renderResurfaceNote", () => {
  it("writes a Resurfaced header and a block per entry", () => {
    const out = renderResurfaceNote("2026-06-09", [
      entry(),
      entry({ id: "200", title: "Another" }),
    ]);
    expect(out).toContain("# Resurfaced - 2026-06-09");
    expect(out).toContain("- [ ] Read: [[100|A thread]]");
    expect(out).toContain("- [ ] Share: [[100|A thread]]");
    expect(out).toContain("  - Topic: AI agents");
    expect(out).toContain("  - Time: 6 min");
    expect(out).toContain("  - Curiosity: why now");
    expect(out).toContain("[[200|Another]]");
  });

  it("shows unknown time and a bare Topic line when those are missing", () => {
    const out = renderResurfaceNote("2026-06-09", [
      entry({ estimatedTimeMinutes: null, topics: [] }),
    ]);
    expect(out).toContain("  - Time: unknown");
    expect(out).toContain("  - Topic:\n");
  });
});

describe("renderPreparedQueueNote", () => {
  it("writes grouped sections in the given order", () => {
    const groups: PreparedGroup[] = [
      {
        name: "Lighter",
        entries: [entry({ id: "1", title: "Light one", estimatedTimeMinutes: 4 })],
      },
      {
        name: "Deeper",
        entries: [entry({ id: "2", title: "Deep one", estimatedTimeMinutes: 12 })],
      },
    ];
    const out = renderPreparedQueueNote("2026-06-09", groups);
    expect(out).toContain("# Reading Queue - 2026-06-09");
    const lighterAt = out.indexOf("## Lighter");
    const deeperAt = out.indexOf("## Deeper");
    expect(lighterAt).toBeGreaterThan(-1);
    expect(deeperAt).toBeGreaterThan(lighterAt);
    expect(out).toContain("- [ ] Read: [[1|Light one]]");
    expect(out).toContain("- [ ] Read: [[2|Deep one]]");
  });
});
