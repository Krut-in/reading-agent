import { wikilinkFor } from "./wikilink";

export interface QueueEntry {
  id: string;
  title: string;
  hook: string;
  estimatedTimeMinutes: number | null;
  topics: string[];
}

function timeText(minutes: number | null): string {
  return minutes === null ? "unknown" : `${minutes} min`;
}

// One Read/Share block per pick. Topic shows the first topic if any. Shared by the read-now and
// resurface notes, which differ only in their H1 and file path.
function entryBlock(e: QueueEntry): string[] {
  const link = wikilinkFor(e.id, e.title);
  const topic = e.topics[0];
  return [
    `- [ ] Read: ${link}`,
    `- [ ] Share: ${link}`,
    topic ? `  - Topic: ${topic}` : "  - Topic:",
    `  - Time: ${timeText(e.estimatedTimeMinutes)}`,
    `  - Curiosity: ${e.hook}`,
    "",
  ];
}

// Read-now note: one Read/Share block per pick, 1 to 5 picks.
export function renderReadNowNote(dateStamp: string, entries: QueueEntry[]): string {
  const lines: string[] = [`# Read Now - ${dateStamp}`, ""];
  for (const e of entries) {
    lines.push(...entryBlock(e));
  }
  return `${lines.join("\n")}\n`;
}

// Resurface note: same block shape as read-now, distinct heading and file (Daily/<date>-resurface.md)
// so a resurface run never overwrites the day's read-now note.
export function renderResurfaceNote(dateStamp: string, entries: QueueEntry[]): string {
  const lines: string[] = [`# Resurfaced - ${dateStamp}`, ""];
  for (const e of entries) {
    lines.push(...entryBlock(e));
  }
  return `${lines.join("\n")}\n`;
}

export interface PreparedGroup {
  name: string;
  entries: QueueEntry[];
}

// Prepared queue: grouped sections (for example Lighter and Deeper) in the given order.
export function renderPreparedQueueNote(dateStamp: string, groups: PreparedGroup[]): string {
  const lines: string[] = [`# Reading Queue - ${dateStamp}`, ""];
  for (const g of groups) {
    lines.push(`## ${g.name}`);
    for (const e of g.entries) {
      lines.push(
        `- [ ] Read: ${wikilinkFor(e.id, e.title)}`,
        `  - Time: ${timeText(e.estimatedTimeMinutes)}`,
        `  - Curiosity: ${e.hook}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
