import fs from "node:fs";
import path from "node:path";
import type { Config } from "../config";
import { openDb } from "../db/connection";
import { initSchema } from "../db/schema";
import { refreshReadingHome } from "../home";
import { SEED_FILES } from "../templates";
import { ensureVault } from "../vault";

export interface SetupResult {
  vaultRoot: string;
  dbPath: string;
  schemaVersion: number;
  foldersCreated: string[];
  foldersExisting: string[];
  filesCreated: string[];
  filesExisting: string[];
  homeWritten: string;
}

// Idempotent. Creates vault folders, the reading.db schema, and seeded static System files.
// Never overwrites an existing seeded file, so user edits survive a re-run.
export function runSetup(config: Config): SetupResult {
  const vault = ensureVault(config.vaultRoot);

  const db = openDb(config.dbPath);
  let schemaVersion: number;
  let homeWritten: string;
  try {
    schemaVersion = initSchema(db);
    // Render the dynamic Reading-Home from the (empty) db so a fresh setup leaves a real
    // "0 gems waiting" note rather than a missing file. Reading-Home is not a seeded static file;
    // it is overwritten by every state-changing command, so setup is just another writer.
    homeWritten = refreshReadingHome(db, config.vaultRoot);
  } finally {
    db.close();
  }

  const filesCreated: string[] = [];
  const filesExisting: string[] = [];
  for (const seed of SEED_FILES) {
    const full = path.join(config.vaultRoot, seed.relPath);
    if (fs.existsSync(full)) {
      filesExisting.push(seed.relPath);
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, seed.content, "utf8");
    filesCreated.push(seed.relPath);
  }

  return {
    vaultRoot: config.vaultRoot,
    dbPath: config.dbPath,
    schemaVersion,
    foldersCreated: vault.created,
    foldersExisting: vault.existing,
    filesCreated,
    filesExisting,
    homeWritten,
  };
}
