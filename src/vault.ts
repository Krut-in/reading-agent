import fs from "node:fs";
import path from "node:path";

export const VAULT_FOLDERS = ["Daily", "Items", "Topics", "System", "Archive", "Runs"] as const;

export interface VaultEnsureResult {
  created: string[];
  existing: string[];
}

// Idempotent: create any missing vault folders, report what was created vs already there.
export function ensureVault(vaultRoot: string): VaultEnsureResult {
  const created: string[] = [];
  const existing: string[] = [];
  for (const folder of VAULT_FOLDERS) {
    const full = path.join(vaultRoot, folder);
    if (fs.existsSync(full)) {
      existing.push(folder);
    } else {
      fs.mkdirSync(full, { recursive: true });
      created.push(folder);
    }
  }
  return { created, existing };
}
