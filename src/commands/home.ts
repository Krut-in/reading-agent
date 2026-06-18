import type { Config } from "../config";
import { openDb } from "../db/connection";
import { refreshReadingHome, selectHomeModel } from "../home";

export interface HomeResult {
  gemCount: number;
  topPickId: string | null;
  written: string;
}

// Refresh System/Reading-Home.md on demand. Read-only on the db apart from the file write.
export function runHome(config: Config): HomeResult {
  const db = openDb(config.dbPath);
  try {
    const model = selectHomeModel(db);
    const written = refreshReadingHome(db, config.vaultRoot, model);
    return { gemCount: model.gemCount, topPickId: model.topPick?.id ?? null, written };
  } finally {
    db.close();
  }
}
