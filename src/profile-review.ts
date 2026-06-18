import type { Db } from "./db/connection";

// Read-only aggregation of the learning-loop signals for /reading-review-profile. Pure over the db
// plus an author lookup (author lives in the corpus, not reading.db, so the command supplies it).
// No writes, no LLM. The skill reasons over this JSON plus System/profile.md and proposes a
// conservative diff for the user's approval; the CLI never edits profile.md.

export interface ProfileItem {
  id: string;
  title: string | null;
  content_type: string | null;
  author: string | null;
  topics: string[];
  last_queued_at: string | null;
}

export interface ProfileStaleItem extends ProfileItem {
  run_count: number;
}

// One row of a by-dimension rollup. `key` is the content_type, author handle, or topic name. The
// counts cover the positive-and-neutral signals (a read or shared is positive; a still-queued item is
// neutral-pending). Skips are tracked per item, not rolled up here.
export interface DimensionCount {
  key: string;
  read: number;
  shared: number;
  queued: number;
}

export interface RunSummary {
  id: string;
  kind: string | null;
  created_at: string | null;
  summary: string | null;
  items: number;
}

export interface ProfileReview {
  totals: Record<string, number>;
  read: ProfileItem[];
  shared: ProfileItem[];
  skipped: ProfileItem[];
  queued_stale: ProfileStaleItem[];
  by_content_type: DimensionCount[];
  by_author: DimensionCount[];
  by_topic: DimensionCount[];
  recent_runs: RunSummary[];
}

const STATUSES = ["unread", "queued", "read", "shared", "skipped", "archived"] as const;

interface ItemRow {
  id: string;
  title: string | null;
  content_type: string | null;
  status: string;
  last_queued_at: string | null;
}

interface Enriched extends ItemRow {
  author: string | null;
  topics: string[];
  run_count: number;
}

function bump(c: DimensionCount, status: string): void {
  if (status === "read") {
    c.read += 1;
  } else if (status === "shared") {
    c.shared += 1;
  } else if (status === "queued") {
    c.queued += 1;
  }
}

function sortDims(map: Map<string, DimensionCount>): DimensionCount[] {
  return [...map.values()].sort((a, b) => {
    const total = b.read + b.shared + b.queued - (a.read + a.shared + a.queued);
    return total !== 0 ? total : a.key.localeCompare(b.key);
  });
}

function tally(items: Enriched[], keyOf: (e: Enriched) => string | null): DimensionCount[] {
  const map = new Map<string, DimensionCount>();
  for (const e of items) {
    const key = keyOf(e);
    if (key === null || key === "") {
      continue;
    }
    let c = map.get(key);
    if (!c) {
      c = { key, read: 0, shared: 0, queued: 0 };
      map.set(key, c);
    }
    bump(c, e.status);
  }
  return sortDims(map);
}

function tallyTopics(items: Enriched[]): DimensionCount[] {
  const map = new Map<string, DimensionCount>();
  for (const e of items) {
    for (const key of e.topics) {
      if (!key) {
        continue;
      }
      let c = map.get(key);
      if (!c) {
        c = { key, read: 0, shared: 0, queued: 0 };
        map.set(key, c);
      }
      bump(c, e.status);
    }
  }
  return sortDims(map);
}

function toItem(e: Enriched): ProfileItem {
  return {
    id: e.id,
    title: e.title,
    content_type: e.content_type,
    author: e.author,
    topics: e.topics,
    last_queued_at: e.last_queued_at,
  };
}

export function buildProfileReview(
  db: Db,
  authorByFtId: Map<string, string | null>,
): ProfileReview {
  const itemRows = db
    .prepare("SELECT id, title, content_type, status, last_queued_at FROM items")
    .all() as ItemRow[];

  const topicsByItem = new Map<string, string[]>();
  const topicRows = db
    .prepare(
      "SELECT it.item_id AS item_id, t.name AS name FROM item_topics it JOIN topics t ON t.id = it.topic_id ORDER BY t.name",
    )
    .all() as Array<{ item_id: string; name: string }>;
  for (const r of topicRows) {
    const list = topicsByItem.get(r.item_id) ?? [];
    list.push(r.name);
    topicsByItem.set(r.item_id, list);
  }

  const runCountByItem = new Map<string, number>();
  const runCountRows = db
    .prepare("SELECT item_id, COUNT(DISTINCT run_id) AS n FROM run_items GROUP BY item_id")
    .all() as Array<{ item_id: string; n: number }>;
  for (const r of runCountRows) {
    runCountByItem.set(r.item_id, r.n);
  }

  const totals: Record<string, number> = {};
  for (const s of STATUSES) {
    totals[s] = 0;
  }

  const enriched: Enriched[] = itemRows.map((row) => ({
    ...row,
    author: authorByFtId.get(row.id) ?? null,
    topics: topicsByItem.get(row.id) ?? [],
    run_count: runCountByItem.get(row.id) ?? 0,
  }));
  for (const e of enriched) {
    totals[e.status] = (totals[e.status] ?? 0) + 1;
  }

  const read = enriched.filter((e) => e.status === "read").map(toItem);
  const shared = enriched.filter((e) => e.status === "shared").map(toItem);
  const skipped = enriched.filter((e) => e.status === "skipped").map(toItem);
  const queued_stale = enriched
    .filter((e) => e.status === "queued" && e.run_count >= 2)
    .map((e) => ({ ...toItem(e), run_count: e.run_count }));

  const signal = enriched.filter(
    (e) => e.status === "read" || e.status === "shared" || e.status === "queued",
  );
  const by_content_type = tally(signal, (e) => e.content_type);
  const by_author = tally(signal, (e) => e.author);
  const by_topic = tallyTopics(signal);

  const recent_runs = db
    .prepare(
      `SELECT cr.id AS id, cr.kind AS kind, cr.created_at AS created_at, cr.summary AS summary,
              (SELECT COUNT(*) FROM run_items ri WHERE ri.run_id = cr.id) AS items
         FROM curation_runs cr
        ORDER BY cr.created_at DESC, cr.id DESC
        LIMIT 20`,
    )
    .all() as RunSummary[];

  return {
    totals,
    read,
    shared,
    skipped,
    queued_stale,
    by_content_type,
    by_author,
    by_topic,
    recent_runs,
  };
}
