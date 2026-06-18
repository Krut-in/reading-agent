import { describe, expect, it } from "vitest";
import { itemNoteRelPath, sanitizeDisplayTitle, wikilinkFor } from "../src/render/wikilink";

describe("itemNoteRelPath", () => {
  it("names the file by the stable id", () => {
    expect(itemNoteRelPath("2064084153533165588")).toBe("Items/2064084153533165588.md");
  });

  it("gives different files to two items that could share a title", () => {
    expect(itemNoteRelPath("100")).not.toBe(itemNoteRelPath("200"));
  });
});

describe("wikilinkFor", () => {
  it("builds an aliased link that resolves by id and displays the title", () => {
    expect(wikilinkFor("100", "Why AI agents need a judgment layer")).toBe(
      "[[100|Why AI agents need a judgment layer]]",
    );
  });

  it("strips characters that would break the link", () => {
    expect(wikilinkFor("100", "A [weird] title | with #marks")).toBe(
      "[[100|A weird title with marks]]",
    );
  });

  it("falls back to a bare link when the title is empty after sanitizing", () => {
    expect(wikilinkFor("100", "   ")).toBe("[[100]]");
  });
});

describe("sanitizeDisplayTitle", () => {
  it("collapses whitespace and removes wikilink-breaking characters", () => {
    expect(sanitizeDisplayTitle("a [b]  c|d")).toBe("a b cd");
  });
});
