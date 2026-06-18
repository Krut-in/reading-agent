import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

// A thin seam over the outside world so doctor is fully testable with injected fakes.
export interface Probes {
  nodeVersion(): string;
  runCommand(cmd: string, args: string[]): { ok: boolean; stdout: string };
  pathExists(p: string): boolean;
}

export const realProbes: Probes = {
  nodeVersion() {
    return process.version;
  },
  runCommand(cmd, args) {
    const res = spawnSync(cmd, args, { encoding: "utf8" });
    const ok = res.status === 0 && !res.error;
    const stdout = (res.stdout ?? "").trim();
    return { ok, stdout };
  },
  pathExists(p) {
    return fs.existsSync(p);
  },
};

export interface NodeStatus {
  version: string;
  major: number;
  ok: boolean;
}

export function detectNode(probes: Probes, minMajor = 20): NodeStatus {
  const version = probes.nodeVersion();
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10);
  return { version, major, ok: Number.isFinite(major) && major >= minMajor };
}

export interface FtStatus {
  installed: boolean;
  version?: string;
  dataPath?: string;
  pathSource?: "ft path" | "ft status --json";
}

export interface FtDataDir {
  dataPath?: string;
  pathSource?: "ft path" | "ft status --json";
}

// Discovers the Field Theory data directory at runtime. We never hardcode it. `ft path` is the
// primary route. The JSON fallback parses a few likely keys. Confirmed against ft 1.3.19:
// `ft path` prints the bookmarks dir directly.
export function discoverFtDataDir(probes: Probes): FtDataDir {
  const ftPath = probes.runCommand("ft", ["path"]);
  if (ftPath.ok && ftPath.stdout) {
    return { dataPath: ftPath.stdout, pathSource: "ft path" };
  }
  const ftStatusJson = probes.runCommand("ft", ["status", "--json"]);
  if (ftStatusJson.ok && ftStatusJson.stdout) {
    const parsed = parsePathFromJson(ftStatusJson.stdout);
    if (parsed) {
      return { dataPath: parsed, pathSource: "ft status --json" };
    }
  }
  return {};
}

// Confirms the binary by running it, then discovers the data path.
export function detectFt(probes: Probes): FtStatus {
  const ver = probes.runCommand("ft", ["--version"]);
  if (!ver.ok) {
    return { installed: false };
  }
  const dir = discoverFtDataDir(probes);
  return {
    installed: true,
    version: ver.stdout || undefined,
    dataPath: dir.dataPath,
    pathSource: dir.pathSource,
  };
}

export interface FtSessionStatus {
  // Whether `ft status --json` ran and parsed at all.
  available: boolean;
  // `bookmarks.connected` from `ft status --json`; undefined when missing or unparseable. Verified
  // against ft 1.3.19: this is false even after a successful Chrome-session sync, so it is not a
  // "have we synced" flag and not an authoritative X-login signal. Reported informationally only.
  connected?: boolean;
  // `bookmarks.lastUpdated` (ISO timestamp of the last sync); undefined when absent. This is the
  // trustworthy freshness signal.
  lastUpdated?: string;
}

// Reads the Field Theory session state from `ft status --json`, fail-soft. Used by doctor to report
// last-sync time and the raw connection flag without claiming to verify a live X login.
export function detectFtSession(probes: Probes): FtSessionStatus {
  const res = probes.runCommand("ft", ["status", "--json"]);
  if (!res.ok || !res.stdout) {
    return { available: false };
  }
  try {
    const obj = JSON.parse(res.stdout) as {
      bookmarks?: { connected?: unknown; lastUpdated?: unknown };
    };
    const bm = obj.bookmarks ?? {};
    return {
      available: true,
      connected: typeof bm.connected === "boolean" ? bm.connected : undefined,
      lastUpdated: typeof bm.lastUpdated === "string" ? bm.lastUpdated : undefined,
    };
  } catch {
    return { available: false };
  }
}

function parsePathFromJson(jsonText: string): string | undefined {
  try {
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    for (const key of ["path", "dataDir", "data_dir", "bookmarksDir", "dir"]) {
      const value = obj[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  } catch {
    // Unrecognized output. Doctor reports the path as undiscovered rather than guessing.
  }
  return undefined;
}

export interface ChromeStatus {
  appPresent: boolean;
  profilePresent: boolean;
}

export function detectChrome(probes: Probes, home: string = os.homedir()): ChromeStatus {
  return {
    appPresent: probes.pathExists("/Applications/Google Chrome.app"),
    profilePresent: probes.pathExists(`${home}/Library/Application Support/Google/Chrome`),
  };
}
