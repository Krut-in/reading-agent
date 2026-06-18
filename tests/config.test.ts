import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../src/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveConfig", () => {
  it("prefers an explicit vaultRoot override over the env var", () => {
    vi.stubEnv("READING_VAULT", "/tmp/envvault");
    const config = resolveConfig({ vaultRoot: "/tmp/x" });
    expect(config.vaultRoot).toBe("/tmp/x");
    expect(config.dbPath).toBe(path.join("/tmp/x", "reading.db"));
  });

  it("falls back to the READING_VAULT env var", () => {
    vi.stubEnv("READING_VAULT", "/tmp/envvault");
    const config = resolveConfig();
    expect(config.vaultRoot).toBe("/tmp/envvault");
    expect(config.dbPath).toBe(path.join("/tmp/envvault", "reading.db"));
  });

  it("defaults to the current working directory when no vault path is configured", () => {
    vi.stubEnv("READING_VAULT", "");
    const config = resolveConfig();
    expect(config.vaultRoot).toBe(process.cwd());
    expect(config.dbPath).toBe(path.join(process.cwd(), "reading.db"));
  });

  it("allows a custom dbPath override", () => {
    const config = resolveConfig({ vaultRoot: "/tmp/x", dbPath: "/tmp/other.db" });
    expect(config.dbPath).toBe("/tmp/other.db");
  });
});
