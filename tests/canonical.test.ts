import { describe, expect, it } from "vitest";
import { canonicalResourceUrl, canonicalUrl } from "../src/canonical";

describe("canonicalUrl (permalink dedupe key)", () => {
  it("strips the query string and fragment", () => {
    expect(canonicalUrl("https://x.com/a/status/1?s=20&utm_source=x#frag")).toBe(
      "https://x.com/a/status/1",
    );
  });

  it("strips a trailing slash", () => {
    expect(canonicalUrl("https://x.com/a/status/1/")).toBe("https://x.com/a/status/1");
  });

  it("lowercases the host and keeps the path case", () => {
    expect(canonicalUrl("https://X.COM/Alpha/status/1")).toBe("https://x.com/Alpha/status/1");
  });

  it("treats the two forms of the same status as equal", () => {
    expect(canonicalUrl("https://x.com/alpha/status/100")).toBe(
      canonicalUrl("https://x.com/alpha/status/100/"),
    );
  });

  it("folds the twitter.com host family to x.com", () => {
    expect(canonicalUrl("https://twitter.com/a/status/1")).toBe("https://x.com/a/status/1");
    expect(canonicalUrl("https://www.twitter.com/a/status/1")).toBe("https://x.com/a/status/1");
    expect(canonicalUrl("https://mobile.twitter.com/a/status/1")).toBe("https://x.com/a/status/1");
  });

  it("folds the x.com host variants to x.com", () => {
    expect(canonicalUrl("https://www.x.com/a/status/1")).toBe("https://x.com/a/status/1");
    expect(canonicalUrl("https://mobile.x.com/a/status/1")).toBe("https://x.com/a/status/1");
  });

  it("truncates X status sub-paths to /<user>/status/<id>", () => {
    expect(canonicalUrl("https://x.com/a/status/1/photo/1")).toBe("https://x.com/a/status/1");
    expect(canonicalUrl("https://x.com/a/status/1/video/2")).toBe("https://x.com/a/status/1");
    expect(canonicalUrl("https://x.com/a/status/1/analytics")).toBe("https://x.com/a/status/1");
    expect(canonicalUrl("https://x.com/a/status/1/likes")).toBe("https://x.com/a/status/1");
  });

  it("keeps the username case when folding a twitter.com sub-path", () => {
    expect(canonicalUrl("https://twitter.com/Alpha/status/1/photo/1")).toBe(
      "https://x.com/Alpha/status/1",
    );
  });

  it("leaves a non-X host structure alone apart from host case and query", () => {
    expect(canonicalUrl("https://Example.com/Path?utm_source=x")).toBe("https://example.com/Path");
  });

  it("is idempotent", () => {
    const once = canonicalUrl("https://twitter.com/Alpha/status/1/photo/1?s=20#x");
    expect(canonicalUrl(once)).toBe(once);
  });

  it("falls back to the trimmed input for a non-url", () => {
    expect(canonicalUrl("  not a url  ")).toBe("not a url");
  });

  it("leaves a clean permalink unchanged (no backfill)", () => {
    for (const url of [
      "https://x.com/agentlab/status/9000000000000000001",
      "https://x.com/promptlab/status/9000000000000000002",
      "https://x.com/docsbot/status/9000000000000000003",
    ]) {
      expect(canonicalUrl(url)).toBe(url);
    }
  });
});

describe("canonicalResourceUrl (outbound cluster key)", () => {
  it("lowercases the host", () => {
    expect(canonicalResourceUrl("http://AGENTS.md")).toBe("http://agents.md");
  });

  it("clusters the two AGENTS.md references to one key", () => {
    expect(canonicalResourceUrl("http://AGENTS.md")).toBe(canonicalResourceUrl("http://agents.md"));
  });

  it("strips the fragment and a trailing slash", () => {
    expect(canonicalResourceUrl("https://example.com/path/#section")).toBe(
      "https://example.com/path",
    );
  });

  it("preserves a meaningful query (YouTube id and timestamp)", () => {
    expect(canonicalResourceUrl("https://www.youtube.com/watch?v=abc123&t=120")).toBe(
      "https://www.youtube.com/watch?v=abc123&t=120",
    );
  });

  it("is idempotent", () => {
    const once = canonicalResourceUrl("https://Example.com/A/?q=1#frag");
    expect(canonicalResourceUrl(once)).toBe(once);
  });

  it("falls back to the trimmed input for a non-url", () => {
    expect(canonicalResourceUrl("  not a url  ")).toBe("not a url");
  });
});
