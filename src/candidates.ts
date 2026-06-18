import { canonicalResourceUrl } from "./canonical";
import { type Clock, realClock } from "./clock";
import type { Db } from "./db/connection";
import type { Classification, RawBookmark } from "./source/types";

export type { Classification };

// Another reading.db item that shares a canonical outbound resource with this one. Status lets the
// skill tell whether the partner is already read or queued before it queues a near-duplicate.
export interface SharedResource {
  ft_id: string;
  status: string;
}

// The ranking-ready record handed to Claude Code. It carries the signals needed to score (text,
// author reach, engagement, links, media, recency) plus the reading-state fields. The deterministic
// CLI assembles it; the judgment (scores, content_type, the pick) happens in the skill.
export interface Candidate {
  ft_id: string;
  url: string;
  title: string;
  text: string;
  authorHandle?: string;
  authorName?: string;
  followerCount?: number;
  isVerified?: boolean;
  postedAt?: string;
  ageDays: number | null;
  language?: string;
  engagement?: RawBookmark["engagement"];
  links: string[];
  mediaTypes: string[];
  hasQuotedTweet: boolean;
  status: string;
  last_queued_at: string | null;
  priority_score: number | null;
  // Field Theory classification (null/empty until `ft classify` has run and the join is supplied).
  primaryCategory: string | null;
  categories: string[];
  primaryDomain: string | null;
  domains: string[];
  // Same-resource cluster (lossless dedupe-by-linked-resource signal).
  resourceKeys: string[];
  sharedResourceWith: SharedResource[];
}

interface StateRow {
  ft_id: string;
  title: string;
  status: string;
  last_queued_at: string | null;
  priority_score: number | null;
}

export interface CandidateOptions {
  limit?: number;
  order?: "newest" | "oldest";
  before?: string;
}

export interface CandidateDeps {
  clock?: Clock;
  classification?: Map<string, Classification>;
}

function mediaTypes(b: RawBookmark): string[] {
  const set = new Set<string>();
  for (const m of b.mediaObjects ?? []) {
    if (m.type) {
      set.add(m.type);
    }
  }
  return [...set];
}

function postedAtMillis(value?: string): number {
  if (!value) {
    return 0;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

// Whole days between postedAt and now. Null when postedAt is missing or unparseable, mirroring how
// the `before` filter treats those rows. Recency is 15 percent of the rubric, so a consistent age
// value replaces each skill re-deriving it from the Twitter date string.
function ageDays(postedAt: string | undefined, nowMs: number): number | null {
  const ms = postedAtMillis(postedAt);
  if (ms === 0) {
    return null;
  }
  return Math.floor((nowMs - ms) / 86_400_000);
}

interface ResourceClusters {
  keysByFtId: Map<string, string[]>;
  sharedByFtId: Map<string, SharedResource[]>;
}

// Pure same-resource clustering over every reading.db item (any status). Two items cluster when their
// canonical outbound resources intersect. Computed over the whole db set so an unread candidate can
// see a partner that is already read or queued, then attached only to unread candidates.
export function computeResourceClusters(
  corpus: RawBookmark[],
  dbItems: { ft_id: string; status: string }[],
): ResourceClusters {
  const corpusById = new Map(corpus.map((b) => [b.id, b]));
  const keysByFtId = new Map<string, string[]>();
  const bucket = new Map<string, SharedResource[]>();

  for (const item of dbItems) {
    const links = corpusById.get(item.ft_id)?.links ?? [];
    const keys = [...new Set(links.map((l) => canonicalResourceUrl(l)))];
    keysByFtId.set(item.ft_id, keys);
    for (const key of keys) {
      const arr = bucket.get(key) ?? [];
      arr.push({ ft_id: item.ft_id, status: item.status });
      bucket.set(key, arr);
    }
  }

  const sharedByFtId = new Map<string, SharedResource[]>();
  for (const item of dbItems) {
    const seen = new Map<string, SharedResource>();
    for (const key of keysByFtId.get(item.ft_id) ?? []) {
      for (const other of bucket.get(key) ?? []) {
        if (other.ft_id !== item.ft_id && !seen.has(other.ft_id)) {
          seen.set(other.ft_id, other);
        }
      }
    }
    sharedByFtId.set(item.ft_id, [...seen.values()]);
  }

  return { keysByFtId, sharedByFtId };
}

// Candidates are the unread items, enriched from the live corpus. Already read, queued, skipped,
// and archived items are excluded by the status filter. Sorted newest first by postedAt by default;
// `order: "oldest"` reverses it (resurfacing forgotten saves). `before` (YYYY-MM-DD) keeps only items
// posted strictly before UTC midnight of that day; an item with a missing or unparseable postedAt is
// dropped by a `before` filter rather than treated as infinitely old.
export function buildCandidates(
  db: Db,
  corpus: RawBookmark[],
  options: CandidateOptions = {},
  deps: CandidateDeps = {},
): Candidate[] {
  const clock = deps.clock ?? realClock;
  const nowMs = clock.now().getTime();
  const classification = deps.classification;

  let beforeMs: number | null = null;
  if (options.before !== undefined) {
    const parsed = Date.parse(`${options.before}T00:00:00Z`);
    if (Number.isNaN(parsed)) {
      throw new Error(
        `buildCandidates: invalid before date "${options.before}" (expected YYYY-MM-DD)`,
      );
    }
    beforeMs = parsed;
  }

  const unreadRows = db
    .prepare(
      "SELECT ft_id, title, status, last_queued_at, priority_score FROM items WHERE status = 'unread'",
    )
    .all() as StateRow[];
  const stateByFtId = new Map(unreadRows.map((r) => [r.ft_id, r]));

  // Cluster over every db item (any status) so an unread candidate can see read/queued partners.
  const allItems = db.prepare("SELECT ft_id, status FROM items").all() as {
    ft_id: string;
    status: string;
  }[];
  const { keysByFtId, sharedByFtId } = computeResourceClusters(corpus, allItems);

  const candidates: Candidate[] = [];
  for (const b of corpus) {
    const state = stateByFtId.get(b.id);
    if (!state) {
      continue;
    }
    if (beforeMs !== null) {
      const ms = postedAtMillis(b.postedAt);
      if (ms === 0 || ms >= beforeMs) {
        continue;
      }
    }
    const classified = classification?.get(b.id);
    candidates.push({
      ft_id: b.id,
      url: b.url,
      title: state.title,
      text: b.text ?? "",
      authorHandle: b.authorHandle ?? b.author?.handle,
      authorName: b.authorName ?? b.author?.name,
      followerCount: b.author?.followerCount,
      isVerified: b.author?.isVerified,
      postedAt: b.postedAt,
      ageDays: ageDays(b.postedAt, nowMs),
      language: b.language,
      engagement: b.engagement,
      links: b.links ?? [],
      mediaTypes: mediaTypes(b),
      hasQuotedTweet: Boolean(b.quotedTweet) || Boolean(b.quotedStatusId),
      status: state.status,
      last_queued_at: state.last_queued_at,
      priority_score: state.priority_score,
      primaryCategory: classified?.primaryCategory ?? null,
      categories: classified?.categories ?? [],
      primaryDomain: classified?.primaryDomain ?? null,
      domains: classified?.domains ?? [],
      resourceKeys: keysByFtId.get(b.id) ?? [],
      sharedResourceWith: sharedByFtId.get(b.id) ?? [],
    });
  }

  const newestFirst = (a: Candidate, b: Candidate) =>
    postedAtMillis(b.postedAt) - postedAtMillis(a.postedAt);
  candidates.sort(options.order === "oldest" ? (a, b) => -newestFirst(a, b) : newestFirst);
  return options.limit ? candidates.slice(0, options.limit) : candidates;
}
