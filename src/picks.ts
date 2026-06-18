// The picks file is the contract between the M4 judgment skill and this deterministic renderer. The
// skill emits it; `reading write` consumes it. Parsing is fail-closed: the whole file is checked
// before `reading write` touches the db or the vault, and the first problem throws a
// PicksValidationError with a precise, actionable message. This module is pure (string in, object
// out). Checks that need the db (unknown id, item status, related-id existence) live in write.ts.

export const CONTENT_TYPES = [
  "article",
  "thread",
  "video",
  "podcast",
  "github",
  "paper",
  "product",
  "documentation",
  "essay",
  "other",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const PICK_KINDS = ["now", "prepared", "resurface"] as const;
export type PickKind = (typeof PICK_KINDS)[number];

export const SELECTED_FOR = ["now", "prepared", "resurface", "topic"] as const;
export type SelectedFor = (typeof SELECTED_FOR)[number];

export interface PitchSections {
  curiosity: string;
  why_picked: string;
  what_you_may_learn: string;
  bookmark_context: string;
  linked_resource_summary: string;
  source_context: string;
  related_items?: string[];
  notes?: string;
}

export interface Pick {
  id: string;
  selected_for: SelectedFor;
  group?: string;
  content_type: ContentType;
  estimated_time_minutes: number;
  priority_score: number;
  usefulness_score: number;
  interest_score: number;
  popularity_score: number;
  recency_score: number;
  topics: string[];
  tags: string[];
  hook: string;
  pitch: PitchSections;
}

export interface PicksFile {
  kind: PickKind;
  available_time_minutes?: number;
  picks: Pick[];
}

export class PicksValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PicksValidationError";
  }
}

function fail(message: string): never {
  throw new PicksValidationError(`picks: ${message}`);
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

function asFiniteNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where} must be a finite number`);
  }
  return value;
}

function asStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    fail(`${where} must be an array of strings`);
  }
  return value as string[];
}

function oneOf<T extends string>(value: string, allowed: readonly T[], where: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    fail(`${where} must be one of ${allowed.join(", ")}, got "${value}"`);
  }
  return value as T;
}

function parsePitch(raw: unknown, where: string): PitchSections {
  const p = asObject(raw, `${where}.pitch`);
  const pitch: PitchSections = {
    curiosity: asString(p.curiosity, `${where}.pitch.curiosity`),
    why_picked: asString(p.why_picked, `${where}.pitch.why_picked`),
    what_you_may_learn: asString(p.what_you_may_learn, `${where}.pitch.what_you_may_learn`),
    bookmark_context: asString(p.bookmark_context, `${where}.pitch.bookmark_context`),
    linked_resource_summary: asString(
      p.linked_resource_summary,
      `${where}.pitch.linked_resource_summary`,
    ),
    source_context: asString(p.source_context, `${where}.pitch.source_context`),
  };
  if (p.related_items !== undefined) {
    pitch.related_items = asStringArray(p.related_items, `${where}.pitch.related_items`);
  }
  if (p.notes !== undefined) {
    pitch.notes = asString(p.notes, `${where}.pitch.notes`);
  }
  return pitch;
}

function parsePick(raw: unknown, index: number, kind: PickKind, seen: Set<string>): Pick {
  const where = `picks[${index}]`;
  const p = asObject(raw, where);

  const id = asNonEmptyString(p.id, `${where}.id`);
  if (seen.has(id)) {
    fail(`duplicate id in picks: ${id}`);
  }
  seen.add(id);

  const selectedFor = oneOf(
    asString(p.selected_for, `${where}.selected_for`),
    SELECTED_FOR,
    `${where}.selected_for`,
  );
  const contentType = oneOf(
    asString(p.content_type, `${where}.content_type`),
    CONTENT_TYPES,
    `${where}.content_type`,
  );

  const estimatedTime = asFiniteNumber(p.estimated_time_minutes, `${where}.estimated_time_minutes`);
  if (!Number.isInteger(estimatedTime) || estimatedTime < 0) {
    fail(`${where}.estimated_time_minutes must be a non-negative integer`);
  }

  const hook = asNonEmptyString(p.hook, `${where}.hook`);
  if (/[\r\n]/.test(hook)) {
    fail(`${where}.hook must be a single line`);
  }

  let group: string | undefined;
  if (p.group !== undefined) {
    group = asNonEmptyString(p.group, `${where}.group`);
  }
  if (kind === "prepared" && group === undefined) {
    fail(`${where}.group is required when kind is "prepared"`);
  }

  return {
    id,
    selected_for: selectedFor,
    group,
    content_type: contentType,
    estimated_time_minutes: estimatedTime,
    priority_score: asFiniteNumber(p.priority_score, `${where}.priority_score`),
    usefulness_score: asFiniteNumber(p.usefulness_score, `${where}.usefulness_score`),
    interest_score: asFiniteNumber(p.interest_score, `${where}.interest_score`),
    popularity_score: asFiniteNumber(p.popularity_score, `${where}.popularity_score`),
    recency_score: asFiniteNumber(p.recency_score, `${where}.recency_score`),
    topics: asStringArray(p.topics, `${where}.topics`),
    tags: asStringArray(p.tags, `${where}.tags`),
    hook,
    pitch: parsePitch(p.pitch, where),
  };
}

export function parsePicksFile(jsonText: string): PicksFile {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (error) {
    throw new PicksValidationError(
      `picks: file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const root = asObject(raw, "file");
  const kind = oneOf(asString(root.kind, "kind"), PICK_KINDS, "kind");

  let availableTime: number | undefined;
  if (root.available_time_minutes !== undefined) {
    availableTime = asFiniteNumber(root.available_time_minutes, "available_time_minutes");
    if (availableTime <= 0) {
      fail("available_time_minutes must be greater than 0");
    }
  }

  if (!Array.isArray(root.picks) || root.picks.length === 0) {
    fail("picks must be a non-empty array");
  }

  const seen = new Set<string>();
  const picks = root.picks.map((p, index) => parsePick(p, index, kind, seen));

  return { kind, available_time_minutes: availableTime, picks };
}
