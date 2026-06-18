// The topic file is the contract between the /reading-connect-topic skill and the deterministic
// `reading topic:write` renderer. The skill does the gathering (ft search), the web research, and the
// writing; it emits this JSON, and the command validates it fail-closed before touching the db or the
// vault. This module is pure (string in, object out). The db-level checks (which related ids exist,
// which already have item notes) live in the command, not here.

export interface TopicSection {
  heading: string;
  body: string;
}

export interface TopicRelatedItem {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface TopicSource {
  title: string;
  url: string;
  publisher: string;
  claim: string;
  corroborated_by: string[];
}

export interface TopicFile {
  topic: string;
  slug?: string;
  summary: string;
  sections: TopicSection[];
  related_items: TopicRelatedItem[];
  sources: TopicSource[];
  unverified: string[];
}

export class TopicValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopicValidationError";
  }
}

function fail(message: string): never {
  throw new TopicValidationError(`topic: ${message}`);
}

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== "string") {
    fail(`${where} must be a string`);
  }
  return value;
}

function asNonEmptyString(value: unknown, where: string): string {
  const s = asString(value, where);
  if (s.trim().length === 0) {
    fail(`${where} must not be empty`);
  }
  return s;
}

function asStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    fail(`${where} must be an array of strings`);
  }
  return value as string[];
}

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(`${where} must be an array`);
  }
  return value;
}

function parseSection(raw: unknown, index: number): TopicSection {
  const where = `sections[${index}]`;
  const s = asObject(raw, where);
  return {
    heading: asNonEmptyString(s.heading, `${where}.heading`),
    body: asString(s.body, `${where}.body`),
  };
}

function parseRelated(raw: unknown, index: number): TopicRelatedItem {
  const where = `related_items[${index}]`;
  const r = asObject(raw, where);
  return {
    id: asNonEmptyString(r.id, `${where}.id`),
    title: asString(r.title, `${where}.title`),
    url: asNonEmptyString(r.url, `${where}.url`),
    note: asString(r.note, `${where}.note`),
  };
}

function parseSource(raw: unknown, index: number): TopicSource {
  const where = `sources[${index}]`;
  const s = asObject(raw, where);
  return {
    title: asString(s.title, `${where}.title`),
    url: asNonEmptyString(s.url, `${where}.url`),
    publisher: asString(s.publisher, `${where}.publisher`),
    claim: asNonEmptyString(s.claim, `${where}.claim`),
    corroborated_by: asStringArray(s.corroborated_by, `${where}.corroborated_by`),
  };
}

export function parseTopicFile(jsonText: string): TopicFile {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (error) {
    throw new TopicValidationError(
      `topic: file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const root = asObject(raw, "file");
  const topic = asNonEmptyString(root.topic, "topic");

  let slug: string | undefined;
  if (root.slug !== undefined) {
    slug = asNonEmptyString(root.slug, "slug");
  }

  const summary = asString(root.summary, "summary");
  const sections = asArray(root.sections, "sections").map(parseSection);
  const relatedItems = asArray(root.related_items, "related_items").map(parseRelated);
  const sources = asArray(root.sources, "sources").map(parseSource);
  const unverified = asStringArray(root.unverified, "unverified");

  return { topic, slug, summary, sections, related_items: relatedItems, sources, unverified };
}
