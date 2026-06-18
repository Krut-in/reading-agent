import fs from "node:fs";
import { type BookmarkSource, type RawBookmark, parseBookmarksJsonl } from "./types";

// Fallback for when session-based ft sync breaks. Reads a JSONL dump in the same shape as Field
// Theory's bookmarks.jsonl. CSV is intentionally deferred; the JSONL path covers the realistic
// "export the cache" case.
export class ManualExportSource implements BookmarkSource {
  readonly id = "manual-export" as const;

  constructor(private readonly filePath: string) {}

  async list(): Promise<RawBookmark[]> {
    if (this.filePath.toLowerCase().endsWith(".csv")) {
      throw new Error("CSV manual-export is not implemented yet. Provide a JSONL dump.");
    }
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`manual-export file not found: ${this.filePath}`);
    }
    const text = fs.readFileSync(this.filePath, "utf8");
    return parseBookmarksJsonl(text).bookmarks;
  }

  async sync(): Promise<RawBookmark[]> {
    return this.list();
  }
}
