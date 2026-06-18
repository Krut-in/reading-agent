import fs from "node:fs";
import path from "node:path";
import type { Config } from "../config";
import { type Db, openDb } from "../db/connection";
import { type TopicNoteModel, type TopicNoteRelated, renderTopicNote } from "../render/topic-note";
import { itemNoteRelPath } from "../render/wikilink";
import { slugify } from "../slug";
import { type TopicFile, parseTopicFile } from "../topic";

export interface TopicWriteOptions {
  topic?: string;
  slug?: string;
  inputPath: string;
}

export interface TopicWriteResult {
  slug: string;
  topic: string;
  notePath: string;
  linked: number;
  skipped: string[];
}

// Render a Topics/<slug>.md note from a skill-produced topic JSON and record the topic and its links.
// Fail-closed on topic identity: a malformed JSON or an empty slug throws before anything is written.
// Skip-with-warning on related ids: an id the corpus has but reading.db does not (the corpus can grow
// between syncs) renders as a plain link and is omitted from item_topics, since the foreign key would
// otherwise abort the whole write. The skill, not the CLI, does the gathering, research, and prose.
export function runTopicWrite(config: Config, opts: TopicWriteOptions): TopicWriteResult {
  if (!fs.existsSync(opts.inputPath)) {
    throw new Error(`reading topic:write: input file not found: ${opts.inputPath}`);
  }
  const parsed = parseTopicFile(fs.readFileSync(opts.inputPath, "utf8"));

  const topic = (opts.topic ?? parsed.topic).trim();
  if (topic.length === 0) {
    throw new Error("reading topic:write: topic name is empty");
  }
  const slug = slugify(opts.slug ?? parsed.slug ?? topic);
  if (slug.length === 0) {
    throw new Error(
      `reading topic:write: topic "${topic}" has no slug characters; pass --slug to set one`,
    );
  }

  const db = openDb(config.dbPath);
  try {
    return applyTopicWrite(db, config.vaultRoot, topic, slug, parsed);
  } finally {
    db.close();
  }
}

function applyTopicWrite(
  db: Db,
  vaultRoot: string,
  topic: string,
  slug: string,
  parsed: TopicFile,
): TopicWriteResult {
  const getItem = db.prepare("SELECT id FROM items WHERE id = ?");
  const notePath = path.join("Topics", `${slug}.md`);

  const related: TopicNoteRelated[] = [];
  const knownIds: string[] = [];
  const knownSeen = new Set<string>();
  const skipped: string[] = [];
  for (const r of parsed.related_items) {
    const known = Boolean(getItem.get(r.id));
    const hasNote = fs.existsSync(path.join(vaultRoot, itemNoteRelPath(r.id)));
    if (known) {
      if (!knownSeen.has(r.id)) {
        knownSeen.add(r.id);
        knownIds.push(r.id);
      }
    } else {
      skipped.push(r.id);
    }
    related.push({ id: r.id, title: r.title, url: r.url, note: r.note, hasNote });
  }

  const apply = db.transaction(() => {
    db.prepare(
      `INSERT INTO topics (id, name, notes_path) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, notes_path = excluded.notes_path`,
    ).run(slug, topic, notePath);
    db.prepare("DELETE FROM item_topics WHERE topic_id = ?").run(slug);
    const insertLink = db.prepare("INSERT INTO item_topics (item_id, topic_id) VALUES (?, ?)");
    for (const id of knownIds) {
      insertLink.run(id, slug);
    }
  });
  apply();

  const model: TopicNoteModel = {
    topic,
    slug,
    summary: parsed.summary,
    sections: parsed.sections,
    related,
    sources: parsed.sources,
    unverified: parsed.unverified,
  };
  const full = path.join(vaultRoot, notePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, renderTopicNote(model), "utf8");

  return { slug, topic, notePath, linked: knownIds.length, skipped };
}
