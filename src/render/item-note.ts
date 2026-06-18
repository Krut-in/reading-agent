import type { PitchSections } from "../picks";
import { type FrontmatterField, emitFrontmatter } from "./frontmatter";
import { wikilinkFor } from "./wikilink";

export interface RelatedItem {
  id: string;
  title: string;
}

// Everything the item-note renderer needs, assembled by write.ts from a pick plus the item's db row.
// The renderer is pure: this model in, the note string out, no filesystem and no db.
export interface ItemNoteModel {
  id: string;
  status: string;
  source: "x" | "manual" | "web";
  url: string;
  canonicalUrl: string | null;
  title: string;
  contentType: string | null;
  topics: string[];
  tags: string[];
  priorityScore: number | null;
  usefulnessScore: number | null;
  interestScore: number | null;
  popularityScore: number | null;
  recencyScore: number | null;
  estimatedTimeMinutes: number | null;
  bookmarkedAt: string | null;
  lastQueuedAt: string | null;
  selectedFor: string;
  hook: string;
  pitch: PitchSections;
  related: RelatedItem[];
}

function frontmatter(model: ItemNoteModel): string {
  const fields: FrontmatterField[] = [
    ["id", model.id],
    ["status", model.status],
    ["source", model.source],
    ["url", model.url],
    ["canonical_url", model.canonicalUrl],
    ["title", model.title],
    ["content_type", model.contentType],
    ["topics", model.topics],
    ["tags", model.tags],
    ["priority_score", model.priorityScore],
    ["usefulness_score", model.usefulnessScore],
    ["interest_score", model.interestScore],
    ["popularity_score", model.popularityScore],
    ["recency_score", model.recencyScore],
    ["estimated_time_minutes", model.estimatedTimeMinutes],
    ["bookmarked_at", model.bookmarkedAt],
    ["last_queued_at", model.lastQueuedAt],
    ["selected_for", model.selectedFor],
  ];
  return emitFrontmatter(fields);
}

function relatedBlock(related: RelatedItem[]): string {
  return related.map((r) => `- ${wikilinkFor(r.id, r.title)}`).join("\n");
}

function sourceBlock(model: ItemNoteModel): string {
  const lines = [`- Original: ${model.url}`];
  if (model.canonicalUrl && model.canonicalUrl !== model.url) {
    lines.push(`- Canonical: ${model.canonicalUrl}`);
  }
  return lines.join("\n");
}

// The curation overlay note. The Read and Share checkboxes are visual only. The Source section is
// built from the db url and canonical_url, never from the pitch.
export function renderItemNote(model: ItemNoteModel): string {
  const p = model.pitch;
  const body = [
    `# ${model.title}`,
    "",
    "- [ ] Read",
    "- [ ] Share",
    "",
    `## Curiosity Pitch\n${p.curiosity}`,
    "",
    `## Why This Was Picked\n${p.why_picked}`,
    "",
    `## What You May Learn\n${p.what_you_may_learn}`,
    "",
    `## Bookmark Context\n${p.bookmark_context}`,
    "",
    `## Linked Resource Summary\n${p.linked_resource_summary}`,
    "",
    `## Source Context\n${p.source_context}`,
    "",
    `## Related Items\n${relatedBlock(model.related)}`,
    "",
    `## Notes\n${p.notes ?? ""}`,
    "",
    `## Source\n${sourceBlock(model)}`,
    "",
  ];
  return `${frontmatter(model)}\n${body.join("\n")}`;
}
