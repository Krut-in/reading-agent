// A tiny deterministic YAML frontmatter emitter. No dependency. It covers exactly the value kinds the
// item note needs (string, number, boolean, null, string array) and nothing else.

export type FrontmatterValue = string | number | boolean | null | string[];
export type FrontmatterField = [key: string, value: FrontmatterValue];

// Quote a string as a YAML double-quoted scalar. We always double-quote, even safe-looking strings,
// so we never have to reason about YAML's special leading characters, indicators, or reserved words
// (a title can start with @, #, -, or be the word "null"). Escape order matters: backslash first, or
// the later steps would double-escape; then the quote; then the named control characters. Any other
// C0 control character (and DEL) is \u-escaped, because YAML forbids a raw control character inside a
// double-quoted scalar and tweet text could in principle carry one. That last step runs by code
// point, never a regex literal, so no raw control character lives in this source file. Emoji and
// other printable multibyte characters pass through verbatim (the file is utf8).
export function quoteYamlString(value: string): string {
  const named = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
  let escaped = "";
  for (const ch of named) {
    const code = ch.codePointAt(0) ?? 0;
    escaped += code < 0x20 || code === 0x7f ? `\\u${code.toString(16).padStart(4, "0")}` : ch;
  }
  return `"${escaped}"`;
}

function emitValue(value: FrontmatterValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Array.isArray(value)) {
    return `[${value.map(quoteYamlString).join(", ")}]`;
  }
  return quoteYamlString(value);
}

// Emit a `---`-delimited frontmatter block. The fields are an ordered list of pairs (not an object)
// so the key order is fixed and re-rendering the same data is byte-identical.
export function emitFrontmatter(fields: FrontmatterField[]): string {
  const lines = fields.map(([key, value]) => `${key}: ${emitValue(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}
