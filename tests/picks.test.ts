import { describe, expect, it } from "vitest";
import { PicksValidationError, parsePicksFile } from "../src/picks";

function defaultPitch(): Record<string, unknown> {
  return {
    curiosity: "c",
    why_picked: "w",
    what_you_may_learn: "l",
    bookmark_context: "b",
    linked_resource_summary: "r",
    source_context: "s",
  };
}

function validPick(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "100",
    selected_for: "now",
    content_type: "thread",
    estimated_time_minutes: 6,
    priority_score: 0.8,
    usefulness_score: 0.9,
    interest_score: 0.8,
    popularity_score: 0.7,
    recency_score: 0.6,
    topics: ["AI agents"],
    tags: ["#agents"],
    hook: "One line on why now",
    pitch: defaultPitch(),
    ...overrides,
  };
}

function validFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: "now", picks: [validPick()], ...overrides };
}

function parse(obj: unknown) {
  return parsePicksFile(JSON.stringify(obj));
}

describe("parsePicksFile happy path", () => {
  it("parses a well-formed file", () => {
    const file = parse(validFile());
    expect(file.kind).toBe("now");
    expect(file.picks).toHaveLength(1);
    expect(file.picks[0].id).toBe("100");
    expect(file.picks[0].pitch.curiosity).toBe("c");
  });

  it("accepts optional related_items and notes", () => {
    const file = parse(
      validFile({
        picks: [validPick({ pitch: { ...defaultPitch(), related_items: ["200"], notes: "n" } })],
      }),
    );
    expect(file.picks[0].pitch.related_items).toEqual(["200"]);
    expect(file.picks[0].pitch.notes).toBe("n");
  });

  it("accepts a prepared file when each pick has a group", () => {
    const file = parse(
      validFile({
        kind: "prepared",
        picks: [validPick({ selected_for: "prepared", group: "Lighter" })],
      }),
    );
    expect(file.picks[0].group).toBe("Lighter");
  });
});

describe("parsePicksFile errors", () => {
  it("rejects invalid JSON", () => {
    expect(() => parsePicksFile("{not json")).toThrow(PicksValidationError);
  });

  it("rejects an unknown kind", () => {
    expect(() => parse(validFile({ kind: "weekly" }))).toThrow(/kind must be one of/);
  });

  it("rejects an empty picks array", () => {
    expect(() => parse(validFile({ picks: [] }))).toThrow(/non-empty array/);
  });

  it("rejects duplicate ids", () => {
    expect(() => parse(validFile({ picks: [validPick(), validPick()] }))).toThrow(/duplicate id/);
  });

  it("rejects a missing required field", () => {
    const pick = validPick();
    pick.hook = undefined;
    expect(() => parse(validFile({ picks: [pick] }))).toThrow(/hook/);
  });

  it("rejects an unknown content_type", () => {
    expect(() => parse(validFile({ picks: [validPick({ content_type: "tweet" })] }))).toThrow(
      /content_type must be one of/,
    );
  });

  it("rejects a non-integer estimated_time_minutes", () => {
    expect(() => parse(validFile({ picks: [validPick({ estimated_time_minutes: 6.5 })] }))).toThrow(
      /non-negative integer/,
    );
  });

  it("rejects a non-finite score", () => {
    expect(() => parse(validFile({ picks: [validPick({ priority_score: "high" })] }))).toThrow(
      /priority_score/,
    );
  });

  it("rejects a multiline hook", () => {
    expect(() => parse(validFile({ picks: [validPick({ hook: "line1\nline2" })] }))).toThrow(
      /single line/,
    );
  });

  it("rejects a missing pitch section", () => {
    const pick = validPick();
    const pitch = { ...(pick.pitch as Record<string, unknown>) };
    pitch.source_context = undefined;
    pick.pitch = pitch;
    expect(() => parse(validFile({ picks: [pick] }))).toThrow(/source_context/);
  });

  it("requires a group when kind is prepared", () => {
    expect(() =>
      parse(validFile({ kind: "prepared", picks: [validPick({ selected_for: "prepared" })] })),
    ).toThrow(/group is required/);
  });
});
