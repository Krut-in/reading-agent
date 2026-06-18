import { describe, expect, it } from "vitest";
import { slugify } from "../src/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("AI Agents")).toBe("ai-agents");
  });

  it("folds punctuation so different display names can share a slug", () => {
    expect(slugify("AI, agents!")).toBe("ai-agents");
    expect(slugify("AI Agents")).toBe(slugify("AI, agents!"));
  });

  it("collapses and trims separators", () => {
    expect(slugify("  Claude   Code  ")).toBe("claude-code");
    expect(slugify("-foo--bar-")).toBe("foo-bar");
  });

  it("folds accents to ASCII", () => {
    expect(slugify("Café Society")).toBe("cafe-society");
  });

  it("returns empty string for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("");
  });
});
