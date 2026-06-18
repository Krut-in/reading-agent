import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type Probes, discoverFtDataDir, realProbes } from "../env";
import {
  type BookmarkSource,
  type Classification,
  type RawBookmark,
  type SyncOptions,
  parseBookmarksJsonl,
} from "./types";

export interface FieldTheoryOptions {
  probes?: Probes;
  // Override the data dir (tests point this at a fixtures folder). When absent, discovered at
  // runtime via `ft path`.
  dataDir?: string;
  // Override the `ft` JSON runner (tests inject a fake). Returns stdout; default spawns `ft`.
  runFtJson?: (args: string[]) => string;
}

// One row of `ft list --json`. Only the classification fields are read here; the corpus itself still
// comes from bookmarks.jsonl via list().
interface FtListRow {
  id: string;
  primaryCategory?: string | null;
  categories?: string[] | null;
  primaryDomain?: string | null;
  domains?: string[] | null;
}

export class FieldTheorySource implements BookmarkSource {
  readonly id = "field-theory" as const;
  private readonly probes: Probes;
  private readonly dataDirOverride?: string;
  private readonly runFtJsonOverride?: (args: string[]) => string;

  constructor(options: FieldTheoryOptions = {}) {
    this.probes = options.probes ?? realProbes;
    this.dataDirOverride = options.dataDir;
    this.runFtJsonOverride = options.runFtJson;
  }

  private dataDir(): string {
    if (this.dataDirOverride) {
      return this.dataDirOverride;
    }
    const discovered = discoverFtDataDir(this.probes);
    if (!discovered.dataPath) {
      throw new Error(
        "Could not discover the Field Theory data directory. Run `ft path` to confirm ft is installed and synced.",
      );
    }
    return discovered.dataPath;
  }

  private jsonlPath(): string {
    return path.join(this.dataDir(), "bookmarks.jsonl");
  }

  private runFtJson(args: string[]): string {
    if (this.runFtJsonOverride) {
      return this.runFtJsonOverride(args);
    }
    const result = spawnSync("ft", args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(
        `\`ft ${args.join(" ")}\` exited with status ${result.status ?? "unknown"}: ${
          result.stderr ?? ""
        }`,
      );
    }
    return result.stdout ?? "";
  }

  async list(): Promise<RawBookmark[]> {
    const file = this.jsonlPath();
    if (!fs.existsSync(file)) {
      throw new Error(`bookmarks.jsonl not found at ${file}. Run \`ft sync\` first.`);
    }
    const text = fs.readFileSync(file, "utf8");
    const { bookmarks } = parseBookmarksJsonl(text);
    return bookmarks;
  }

  // Reads the Field Theory classification (categories and domains) via `ft list --json`, paged until
  // exhausted, keyed by id. Field Theory owns classification; this only consumes it. The `reading`
  // CLI never invokes `ft classify`. An "unclassified" primaryCategory is mapped to null (no signal).
  listClassified(pageSize = 200): Map<string, Classification> {
    const map = new Map<string, Classification>();
    // Hard page cap so a misbehaving `ft` that ignores --offset can never spin forever. 1000 pages
    // is far beyond any personal backlog.
    const maxPages = 1000;
    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
      const out = this.runFtJson([
        "list",
        "--json",
        "--limit",
        String(pageSize),
        "--offset",
        String(offset),
      ]);
      const rows = JSON.parse(out) as FtListRow[];
      if (!Array.isArray(rows) || rows.length === 0) {
        break;
      }
      for (const r of rows) {
        const primaryCategory =
          r.primaryCategory && r.primaryCategory !== "unclassified" ? r.primaryCategory : null;
        map.set(r.id, {
          primaryCategory,
          categories: r.categories ?? [],
          primaryDomain: r.primaryDomain ?? null,
          domains: r.domains ?? [],
        });
      }
      if (rows.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
    return map;
  }

  async sync(opts: SyncOptions = {}): Promise<RawBookmark[]> {
    if (opts.pull) {
      pullFtSync(opts);
    }
    return this.list();
  }
}

// Side-effecting pull. Defaults to --no-media and --skip-profile-images so a refresh never
// re-downloads media or avatar images (use withMedia to opt in). Flags confirmed against ft 1.3.19
// `ft sync --help`.
export function pullFtSync(opts: SyncOptions): void {
  const args = ["sync", "--yes"];
  if (!opts.withMedia) {
    args.push("--no-media", "--skip-profile-images");
  }
  if (opts.gaps) {
    args.push("--gaps");
  }
  const result = spawnSync("ft", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`\`ft ${args.join(" ")}\` exited with status ${result.status ?? "unknown"}`);
  }
}
