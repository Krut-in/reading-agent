import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CheckResult, runDoctor } from "../src/commands/doctor";
import type { Config } from "../src/config";
import { openDb } from "../src/db/connection";
import { initSchema } from "../src/db/schema";
import type { Probes } from "../src/env";
import { ensureVault } from "../src/vault";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-doctor-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

interface ProbeOpts {
  nodeVersion?: string;
  ftInstalled?: boolean;
  ftPath?: string;
  chromeApp?: boolean;
  ftStatusJson?: string;
}

const CHROME_APP = "/Applications/Google Chrome.app";

// Fakes only the outside world. Filesystem existence for vault folders and the db delegates to
// real fs against the temp dir, so those checks reflect actual setup.
function makeProbes(opts: ProbeOpts): Probes {
  return {
    nodeVersion: () => opts.nodeVersion ?? "v22.13.0",
    runCommand: (cmd, args) => {
      if (cmd === "ft" && args[0] === "--version") {
        return opts.ftInstalled ? { ok: true, stdout: "1.2.3" } : { ok: false, stdout: "" };
      }
      if (cmd === "ft" && args[0] === "path") {
        return opts.ftPath ? { ok: true, stdout: opts.ftPath } : { ok: false, stdout: "" };
      }
      if (cmd === "ft" && args[0] === "status" && args[1] === "--json") {
        return opts.ftStatusJson
          ? { ok: true, stdout: opts.ftStatusJson }
          : { ok: false, stdout: "" };
      }
      return { ok: false, stdout: "" };
    },
    pathExists: (p) => {
      if (p === CHROME_APP) return opts.chromeApp ?? false;
      if (p.includes("Library/Application Support/Google/Chrome")) return opts.chromeApp ?? false;
      return fs.existsSync(p);
    },
  };
}

function configFor(dir: string): Config {
  return { vaultRoot: dir, dbPath: path.join(dir, "reading.db") };
}

function byName(checks: CheckResult[], name: string): CheckResult {
  const found = checks.find((c) => c.name === name);
  if (!found) throw new Error(`no check named ${name}`);
  return found;
}

function seedDb(dbPath: string): void {
  const db = openDb(dbPath);
  initSchema(db);
  db.close();
}

describe("runDoctor", () => {
  it("passes everything except ft when only Field Theory is missing", () => {
    ensureVault(tmp);
    seedDb(path.join(tmp, "reading.db"));
    const report = runDoctor(configFor(tmp), makeProbes({ ftInstalled: false, chromeApp: true }));

    expect(byName(report.checks, "Node >= 20").status).toBe("pass");
    expect(byName(report.checks, "Vault folders").status).toBe("pass");
    expect(byName(report.checks, "reading.db schema").status).toBe("pass");
    expect(byName(report.checks, "Chrome present").status).toBe("pass");

    const ft = byName(report.checks, "Field Theory (ft) installed");
    expect(ft.status).toBe("fail");
    expect(ft.remediation).toContain("npm i -g fieldtheory");

    expect(report.ok).toBe(false);
  });

  it("reports ok when ft, vault, and db are all ready", () => {
    ensureVault(tmp);
    seedDb(path.join(tmp, "reading.db"));
    const report = runDoctor(
      configFor(tmp),
      makeProbes({
        ftInstalled: true,
        ftPath: "/Users/someone/.fieldtheory/bookmarks",
        chromeApp: true,
      }),
    );

    expect(report.ok).toBe(true);
    expect(byName(report.checks, "Field Theory (ft) installed").status).toBe("pass");
    const ftPath = byName(report.checks, "Field Theory data path");
    expect(ftPath.status).toBe("pass");
    expect(ftPath.detail).toContain(".fieldtheory/bookmarks");
  });

  it("fails vault and db checks on a fresh, unconfigured machine", () => {
    const report = runDoctor(configFor(tmp), makeProbes({ ftInstalled: false, chromeApp: false }));

    expect(byName(report.checks, "Vault folders").status).toBe("fail");
    expect(byName(report.checks, "reading.db schema").status).toBe("fail");
    expect(byName(report.checks, "Chrome present").status).toBe("warn");
    expect(report.ok).toBe(false);
  });

  it("reports the X session informationally: last-sync passes with a caveated connected flag", () => {
    ensureVault(tmp);
    seedDb(path.join(tmp, "reading.db"));
    const statusJson = JSON.stringify({
      bookmarks: { connected: false, bookmarkCount: 42, lastUpdated: "2026-06-09T13:19:16.007Z" },
    });
    const report = runDoctor(
      configFor(tmp),
      makeProbes({
        ftInstalled: true,
        ftPath: "/x/.fieldtheory/bookmarks",
        chromeApp: true,
        ftStatusJson: statusJson,
      }),
    );

    const session = byName(report.checks, "Field Theory session");
    expect(session.status).toBe("pass");
    expect(session.required).toBe(false);
    expect(session.detail).toContain("last synced 2026-06-09T13:19:16.007Z");
    expect(session.detail).toContain("connected=false");
    expect(session.detail).toContain("reading sync --pull");
    // A false connected flag is informational and must not sink the overall report.
    expect(report.ok).toBe(true);
  });

  it("warns without failing when ft reports no sync yet", () => {
    ensureVault(tmp);
    seedDb(path.join(tmp, "reading.db"));
    const statusJson = JSON.stringify({ bookmarks: { connected: false } });
    const report = runDoctor(
      configFor(tmp),
      makeProbes({
        ftInstalled: true,
        ftPath: "/x/.fieldtheory/bookmarks",
        chromeApp: true,
        ftStatusJson: statusJson,
      }),
    );

    const session = byName(report.checks, "Field Theory session");
    expect(session.status).toBe("warn");
    expect(session.required).toBe(false);
    expect(report.ok).toBe(true);
  });

  it("omits the session check when ft is not installed", () => {
    ensureVault(tmp);
    seedDb(path.join(tmp, "reading.db"));
    const report = runDoctor(configFor(tmp), makeProbes({ ftInstalled: false, chromeApp: true }));
    expect(report.checks.find((c) => c.name === "Field Theory session")).toBeUndefined();
  });
});
