import { wikilinkFor } from "./wikilink";

export interface ReadingHomeTopPick {
  id: string;
  title: string;
  hook: string;
  estimatedTimeMinutes: number | null;
}

export interface ReadingHomeModel {
  gemCount: number;
  topPick: ReadingHomeTopPick | null;
}

function formatTime(minutes: number | null): string {
  return minutes === null ? "unknown" : `${minutes} min`;
}

// The ambient nudge. It shows the curated-gem count (queued items) and, when there is one, the single
// most compelling pick with its one-line hook and estimated time. When nothing is curated yet, the
// "Start here" block is dropped and only the count line and the prompt remain.
export function renderReadingHome(model: ReadingHomeModel): string {
  const noun = model.gemCount === 1 ? "gem" : "gems";
  const lines: string[] = ["# Reading Home", "", `You have ${model.gemCount} ${noun} waiting.`, ""];
  if (model.topPick) {
    lines.push(
      "## Start here",
      `- ${wikilinkFor(model.topPick.id, model.topPick.title)}`,
      `  - Why now: ${model.topPick.hook}`,
      `  - Time: ${formatTime(model.topPick.estimatedTimeMinutes)}`,
      "",
    );
  }
  lines.push("Run /reading-now for a fresh set.");
  return `${lines.join("\n")}\n`;
}
