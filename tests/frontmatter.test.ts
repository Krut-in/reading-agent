import { describe, expect, it } from "vitest";
import { type FrontmatterField, emitFrontmatter, quoteYamlString } from "../src/render/frontmatter";

describe("quoteYamlString", () => {
  it("double-quotes a plain string", () => {
    expect(quoteYamlString("Hello world")).toBe('"Hello world"');
  });

  it("escapes embedded double quotes", () => {
    expect(quoteYamlString('She said "hi"')).toBe('"She said \\"hi\\""');
  });

  it("escapes a backslash before it would touch the quote", () => {
    expect(quoteYamlString("a\\b")).toBe('"a\\\\b"');
  });

  it("keeps colons, hashes, and at-signs inside the quotes", () => {
    expect(quoteYamlString("@addy: note #1")).toBe('"@addy: note #1"');
  });

  it("passes emoji and curly apostrophes through verbatim", () => {
    expect(quoteYamlString("today’s 🚀 ship")).toBe('"today’s 🚀 ship"');
  });

  it("escapes a newline rather than breaking the line", () => {
    expect(quoteYamlString("a\nb")).toBe('"a\\nb"');
  });

  it("escapes other C0 control characters as unicode sequences", () => {
    const nul = String.fromCharCode(0);
    const bell = String.fromCharCode(7);
    expect(quoteYamlString(`a${nul}b${bell}c`)).toBe('"a\\u0000b\\u0007c"');
  });

  it("escapes a vertical tab, form feed, and DEL", () => {
    const vt = String.fromCharCode(0x0b);
    const ff = String.fromCharCode(0x0c);
    const del = String.fromCharCode(0x7f);
    expect(quoteYamlString(`${vt}${ff}${del}`)).toBe('"\\u000b\\u000c\\u007f"');
  });
});

describe("emitFrontmatter", () => {
  it("emits an ordered, delimited block", () => {
    const out = emitFrontmatter([
      ["id", "100"],
      ["priority_score", 0.82],
      ["estimated_time_minutes", 6],
      ["bookmarked_at", null],
      ["topics", ["AI agents", "tooling"]],
      ["tags", []],
    ]);
    expect(out).toBe(
      [
        "---",
        'id: "100"',
        "priority_score: 0.82",
        "estimated_time_minutes: 6",
        "bookmarked_at: null",
        'topics: ["AI agents", "tooling"]',
        "tags: []",
        "---",
        "",
      ].join("\n"),
    );
  });

  it("distinguishes a null value from the string null", () => {
    const out = emitFrontmatter([
      ["a", null],
      ["b", "null"],
    ]);
    expect(out).toContain("a: null");
    expect(out).toContain('b: "null"');
  });

  it("escapes each array element", () => {
    expect(emitFrontmatter([["tags", ['a"b', "c,d"]]])).toContain('tags: ["a\\"b", "c,d"]');
  });

  it("is byte-stable across renders", () => {
    const fields: FrontmatterField[] = [
      ["title", "x"],
      ["n", 1],
    ];
    expect(emitFrontmatter(fields)).toBe(emitFrontmatter(fields));
  });
});
