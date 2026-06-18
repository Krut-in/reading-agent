import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VAULT_FOLDERS, ensureVault } from "../src/vault";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-vault-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("ensureVault", () => {
  it("creates all folders on the first run", () => {
    const result = ensureVault(tmp);
    expect(result.created.sort()).toEqual([...VAULT_FOLDERS].sort());
    for (const folder of VAULT_FOLDERS) {
      expect(fs.existsSync(path.join(tmp, folder))).toBe(true);
    }
  });

  it("is idempotent on a second run", () => {
    ensureVault(tmp);
    const second = ensureVault(tmp);
    expect(second.created).toEqual([]);
    expect(second.existing.sort()).toEqual([...VAULT_FOLDERS].sort());
  });
});
