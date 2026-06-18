import type { TopicSection, TopicSource } from "../topic";
import { type FrontmatterField, emitFrontmatter } from "./frontmatter";
import { wikilinkFor } from "./wikilink";

// A related saved item, ready to render. `hasNote` (does Items/<id>.md exist?) is decided by the
// command, not here, so this renderer stays pure. A related item with a note links by wikilink; one
// without (never curated, or an id the corpus has but reading.db does not yet) renders as a plain
// link to its X url.
export interface TopicNoteRelated {
  id: string;
  title: string;
  url: string;
  note: string;
  hasNote: boolean;
}

export interface TopicNoteModel {
  topic: string;
  slug: string;
  summary: string;
  sections: TopicSection[];
  related: TopicNoteRelated[];
  sources: TopicSource[];
  unverified: string[];
}

function frontmatter(model: TopicNoteModel): string {
  const fields: FrontmatterField[] = [
    ["topic", model.topic],
    ["slug", model.slug],
    ["type", "topic"],
    ["related_count", model.related.length],
    ["sources_count", model.sources.length],
  ];
  return emitFrontmatter(fields);
}

function relatedLine(r: TopicNoteRelated): string {
  const link = r.hasNote ? wikilinkFor(r.id, r.title) : `[${r.title.trim() || r.url}](${r.url})`;
  const note = r.note.trim();
  return note.length > 0 ? `- ${link} (${note})` : `- ${link}`;
}

function sourceBlock(s: TopicSource): string[] {
  const title = s.title.trim() || s.url;
  const publisher = s.publisher.trim();
  const lines = [
    `- ${s.claim}`,
    `  - Source: [${title}](${s.url})${publisher ? `, ${publisher}` : ""}`,
  ];
  if (s.corroborated_by.length > 0) {
    const links = s.corroborated_by.map((u, i) => `[${i + 1}](${u})`).join(", ");
    lines.push(`  - Corroborated by: ${links}`);
  }
  return lines;
}

// The Topics/ connection note. Frontmatter is byte-stable (fixed key order, no timestamp), so a
// same-input re-run is identical. The three trailing sections always render, with a placeholder when
// empty, so the note shape is predictable for Dataview and for the reader.
export function renderTopicNote(model: TopicNoteModel): string {
  const parts: string[] = [frontmatter(model), `# ${model.topic}`, ""];
  if (model.summary.trim().length > 0) {
    parts.push(model.summary, "");
  }
  for (const s of model.sections) {
    parts.push(`## ${s.heading}`, s.body, "");
  }

  parts.push("## Related Saved Items");
  if (model.related.length > 0) {
    for (const r of model.related) {
      parts.push(relatedLine(r));
    }
  } else {
    parts.push("- (none)");
  }
  parts.push("");

  parts.push("## Sources");
  if (model.sources.length > 0) {
    for (const s of model.sources) {
      parts.push(...sourceBlock(s));
    }
  } else {
    parts.push("- (none)");
  }
  parts.push("");

  parts.push("## Could Not Verify");
  if (model.unverified.length > 0) {
    for (const u of model.unverified) {
      parts.push(`- ${u}`);
    }
  } else {
    parts.push("- Nothing flagged this pass.");
  }
  parts.push("");

  return `${parts.join("\n")}\n`;
}
