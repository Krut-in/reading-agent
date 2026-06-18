import path from "node:path";

export interface Config {
  vaultRoot: string;
  dbPath: string;
}

export interface ConfigOverrides {
  vaultRoot?: string;
  dbPath?: string;
}

const DEFAULT_VAULT_ROOT = process.cwd();

export function resolveConfig(overrides: ConfigOverrides = {}): Config {
  const envVaultRoot = process.env.READING_VAULT?.trim();
  const vaultRoot = overrides.vaultRoot ?? (envVaultRoot || DEFAULT_VAULT_ROOT);
  const dbPath = overrides.dbPath ?? path.join(vaultRoot, "reading.db");
  return { vaultRoot, dbPath };
}
