import path from "node:path";

// Item notes are named by the stable item id, never the human title, so two bookmarks that share a
// derived title never collide on disk. The id is also how `mark` and `write` address an item.
export function itemNoteRelPath(id: string): string {
  return path.join("Items", `${id}.md`);
}

// Strip the characters that would break an Obsidian wikilink target or alias, then collapse
// whitespace. Applied to the display alias only; the link still resolves by the id-named file.
export function sanitizeDisplayTitle(title: string): string {
  return title
    .replace(/[|#^]/g, "")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replace(/\s+/g, " ")
    .trim();
}

// An aliased wikilink: Obsidian shows the title and resolves by the unique id-named file, e.g.
// [[2064084153533165588|Why AI agents need a judgment layer]]. Falls back to a bare [[id]] when the
// title is empty after sanitizing.
export function wikilinkFor(id: string, title: string): string {
  const display = sanitizeDisplayTitle(title);
  return display.length > 0 ? `[[${id}|${display}]]` : `[[${id}]]`;
}
