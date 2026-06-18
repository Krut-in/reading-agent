import fs from "node:fs";
import path from "node:path";
import { type Clock, localDateStamp, nowIso } from "../clock";
import type { Config } from "../config";
import { type Db, openDb } from "../db/connection";
import { refreshReadingHome } from "../home";
import { type Pick, type PicksFile, parsePicksFile } from "../picks";
import { type ItemNoteModel, type RelatedItem, renderItemNote } from "../render/item-note";
import {
  type PreparedGroup,
  type QueueEntry,
  renderPreparedQueueNote,
  renderReadNowNote,
  renderResurfaceNote,
} from "../render/queue-notes";
import { itemNoteRelPath } from "../render/wikilink";

export interface WriteOptions {
  picksPath: string;
  clock: Clock;
}

export interface WriteResult {
  runId: string;
  kind: string;
  itemNotesWritten: string[];
  queueNoteWritten: string | null;
  homeWritten: string;
  queued: number;
  reused: number;
}

interface ItemRow {
  id: string;
  url: string;
  canonical_url: string | null;
  title: string | null;
  bookmarked_at: string | null;
  status: string;
}

// Render item notes and the queue note from a picks JSON, and record the structured reading state.
// Order matters for fail-closed behavior: the whole file is validated and every id (including related
// ids) is resolved against the db before anything is written; then all db mutations run in one
// transaction; then the notes are rendered (pure) and written; then Reading-Home is refreshed.
export function runWrite(config: Config, opts: WriteOptions): WriteResult {
  if (!fs.existsSync(opts.picksPath)) {
    throw new Error(`reading write: picks file not found: ${opts.picksPath}`);
  }
  const picks = parsePicksFile(fs.readFileSync(opts.picksPath, "utf8"));

  const db = openDb(config.dbPath);
  try {
    return applyWrite(db, config.vaultRoot, picks, opts.clock);
  } finally {
    db.close();
  }
}

function applyWrite(db: Db, vaultRoot: string, picks: PicksFile, clock: Clock): WriteResult {
  const getItem = db.prepare(
    "SELECT id, url, canonical_url, title, bookmarked_at, status FROM items WHERE id = ?",
  );

  // Resolve every pick and every related id against the db before touching anything. Fail-closed.
  const rows = new Map<string, ItemRow>();
  for (const pick of picks.picks) {
    const row = getItem.get(pick.id) as ItemRow | undefined;
    if (!row) {
      throw new Error(`reading write: unknown item id: ${pick.id} (run \`reading sync\` first?)`);
    }
    if (row.status !== "unread" && row.status !== "queued") {
      throw new Error(
        `reading write: cannot queue ${pick.id}: status is ${row.status} (already read or archived)`,
      );
    }
    rows.set(pick.id, row);
    for (const relId of pick.pitch.related_items ?? []) {
      if (!getItem.get(relId)) {
        throw new Error(`reading write: related item not found: ${relId} (in pick ${pick.id})`);
      }
    }
  }

  const queuedAt = nowIso(clock);
  const dateStamp = localDateStamp(clock);
  const runId = `${picks.kind}-${dateStamp}`;

  let queued = 0;
  let reused = 0;
  const apply = db.transaction(() => {
    db.prepare(
      `INSERT INTO curation_runs (id, kind, created_at, summary) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at,
                                     summary = excluded.summary`,
    ).run(runId, picks.kind, queuedAt, summaryFor(picks));
    db.prepare("DELETE FROM run_items WHERE run_id = ?").run(runId);

    const update = db.prepare(
      `UPDATE items
          SET status = 'queued',
              last_queued_at = @queuedAt,
              content_type = @contentType,
              priority_score = @priority,
              usefulness_score = @usefulness,
              interest_score = @interest,
              popularity_score = @popularity,
              recency_score = @recency,
              estimated_time_minutes = @estMinutes
        WHERE id = @id`,
    );
    const insertRunItem = db.prepare(
      "INSERT INTO run_items (run_id, item_id, selected_for, reason) VALUES (?, ?, ?, ?)",
    );

    for (const pick of picks.picks) {
      const row = rows.get(pick.id) as ItemRow;
      if (row.status === "unread") {
        queued++;
      } else {
        reused++;
      }
      update.run({
        id: pick.id,
        queuedAt,
        contentType: pick.content_type,
        priority: pick.priority_score,
        usefulness: pick.usefulness_score,
        interest: pick.interest_score,
        popularity: pick.popularity_score,
        recency: pick.recency_score,
        estMinutes: pick.estimated_time_minutes,
      });
      insertRunItem.run(runId, pick.id, pick.selected_for, pick.hook);
    }
  });
  apply();

  const itemNotesWritten: string[] = [];
  for (const pick of picks.picks) {
    const row = rows.get(pick.id) as ItemRow;
    const model = buildItemModel(pick, row, queuedAt, getItem);
    const rel = itemNoteRelPath(pick.id);
    writeVaultFile(vaultRoot, rel, renderItemNote(model));
    itemNotesWritten.push(rel);
  }

  const queueNoteWritten = writeQueueNote(vaultRoot, picks, rows, dateStamp);
  const homeWritten = refreshReadingHome(db, vaultRoot);

  return {
    runId,
    kind: picks.kind,
    itemNotesWritten,
    queueNoteWritten,
    homeWritten,
    queued,
    reused,
  };
}

type Statement = ReturnType<Db["prepare"]>;

function resolveRelated(ids: string[] | undefined, getItem: Statement): RelatedItem[] {
  return (ids ?? []).map((id) => {
    const row = getItem.get(id) as ItemRow | undefined;
    return { id, title: row?.title ?? id };
  });
}

function buildItemModel(
  pick: Pick,
  row: ItemRow,
  queuedAt: string,
  getItem: Statement,
): ItemNoteModel {
  return {
    id: pick.id,
    status: "queued",
    source: "x",
    url: row.url,
    canonicalUrl: row.canonical_url,
    title: row.title ?? pick.id,
    contentType: pick.content_type,
    topics: pick.topics,
    tags: pick.tags,
    priorityScore: pick.priority_score,
    usefulnessScore: pick.usefulness_score,
    interestScore: pick.interest_score,
    popularityScore: pick.popularity_score,
    recencyScore: pick.recency_score,
    estimatedTimeMinutes: pick.estimated_time_minutes,
    bookmarkedAt: row.bookmarked_at,
    lastQueuedAt: queuedAt,
    selectedFor: pick.selected_for,
    hook: pick.hook,
    pitch: pick.pitch,
    related: resolveRelated(pick.pitch.related_items, getItem),
  };
}

function toEntry(pick: Pick, row: ItemRow): QueueEntry {
  return {
    id: pick.id,
    title: row.title ?? pick.id,
    hook: pick.hook,
    estimatedTimeMinutes: pick.estimated_time_minutes,
    topics: pick.topics,
  };
}

function groupEntries(picks: PicksFile, rows: Map<string, ItemRow>): PreparedGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, QueueEntry[]>();
  for (const pick of picks.picks) {
    const name = pick.group ?? "Queue";
    if (!byGroup.has(name)) {
      byGroup.set(name, []);
      order.push(name);
    }
    byGroup.get(name)?.push(toEntry(pick, rows.get(pick.id) as ItemRow));
  }
  return order.map((name) => ({ name, entries: byGroup.get(name) ?? [] }));
}

function writeQueueNote(
  vaultRoot: string,
  picks: PicksFile,
  rows: Map<string, ItemRow>,
  dateStamp: string,
): string {
  if (picks.kind === "prepared") {
    const rel = path.join("Daily", `${dateStamp}.md`);
    writeVaultFile(vaultRoot, rel, renderPreparedQueueNote(dateStamp, groupEntries(picks, rows)));
    return rel;
  }
  const entries = picks.picks.map((p) => toEntry(p, rows.get(p.id) as ItemRow));
  if (picks.kind === "resurface") {
    const rel = path.join("Daily", `${dateStamp}-resurface.md`);
    writeVaultFile(vaultRoot, rel, renderResurfaceNote(dateStamp, entries));
    return rel;
  }
  const rel = path.join("Daily", `${dateStamp}-read-now.md`);
  writeVaultFile(vaultRoot, rel, renderReadNowNote(dateStamp, entries));
  return rel;
}

function summaryFor(picks: PicksFile): string {
  const count = picks.picks.length;
  const noun = count === 1 ? "item" : "items";
  const time = picks.available_time_minutes
    ? `, ${picks.available_time_minutes} min available`
    : "";
  return `${picks.kind}: ${count} ${noun}${time}`;
}

function writeVaultFile(vaultRoot: string, relPath: string, content: string): void {
  const full = path.join(vaultRoot, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}
