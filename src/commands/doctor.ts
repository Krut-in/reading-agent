import path from "node:path";
import type { Config } from "../config";
import { openDb } from "../db/connection";
import { SCHEMA_VERSION, getSchemaVersion } from "../db/schema";
import {
  type FtSessionStatus,
  type Probes,
  detectChrome,
  detectFt,
  detectFtSession,
  detectNode,
} from "../env";
import { VAULT_FOLDERS } from "../vault";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  remediation?: string;
  required: boolean;
}

export interface DoctorReport {
  checks: CheckResult[];
  ok: boolean;
}

// Read-only. Reports setup state and never creates anything. `ok` is false when any required
// check fails, which the CLI maps to a nonzero exit code.
export function runDoctor(config: Config, probes: Probes): DoctorReport {
  const checks: CheckResult[] = [];

  const node = detectNode(probes);
  checks.push({
    name: "Node >= 20",
    status: node.ok ? "pass" : "fail",
    detail: node.ok ? node.version : `${node.version} is below the minimum`,
    remediation: node.ok ? undefined : "install Node 20 or newer",
    required: true,
  });

  const ft = detectFt(probes);
  checks.push({
    name: "Field Theory (ft) installed",
    status: ft.installed ? "pass" : "fail",
    detail: ft.installed ? (ft.version ? `version ${ft.version}` : "present") : "not found on PATH",
    remediation: ft.installed ? undefined : "install with: npm i -g fieldtheory",
    required: true,
  });

  if (ft.installed) {
    checks.push({
      name: "Field Theory data path",
      status: ft.dataPath ? "pass" : "warn",
      detail: ft.dataPath
        ? `${ft.dataPath} (via ${ft.pathSource})`
        : "could not discover via `ft path` or `ft status --json`",
      remediation: ft.dataPath ? undefined : "run `ft path` to confirm the data directory",
      required: false,
    });
  } else {
    checks.push({
      name: "Field Theory data path",
      status: "warn",
      detail: "skipped (ft not installed)",
      required: false,
    });
  }

  const chrome = detectChrome(probes);
  checks.push({
    name: "Chrome present",
    status: chrome.appPresent ? "pass" : "warn",
    detail: chrome.appPresent
      ? "Google Chrome detected. X login is not auto-verified; the first ft sync confirms it."
      : "Google Chrome not found in /Applications",
    remediation: chrome.appPresent
      ? undefined
      : "install Chrome, or configure Field Theory for Firefox",
    required: false,
  });

  if (ft.installed) {
    checks.push(buildSessionCheck(detectFtSession(probes)));
  }

  const missingFolders = VAULT_FOLDERS.filter(
    (folder) => !probes.pathExists(path.join(config.vaultRoot, folder)),
  );
  checks.push({
    name: "Vault folders",
    status: missingFolders.length === 0 ? "pass" : "fail",
    detail: missingFolders.length === 0 ? "all present" : `missing: ${missingFolders.join(", ")}`,
    remediation: missingFolders.length === 0 ? undefined : "run `reading setup`",
    required: true,
  });

  if (!probes.pathExists(config.dbPath)) {
    checks.push({
      name: "reading.db schema",
      status: "fail",
      detail: "reading.db not found",
      remediation: "run `reading setup`",
      required: true,
    });
  } else {
    const version = readSchemaVersion(config.dbPath);
    const okVersion = version === SCHEMA_VERSION;
    checks.push({
      name: "reading.db schema",
      status: okVersion ? "pass" : "warn",
      detail: okVersion
        ? `schema version ${version}`
        : `schema version ${version}, expected ${SCHEMA_VERSION}`,
      remediation: okVersion ? undefined : "run `reading setup` to update the schema",
      required: true,
    });
  }

  const ok = checks.every((check) => !(check.required && check.status === "fail"));
  return { checks, ok };
}

function readSchemaVersion(dbPath: string): number {
  const db = openDb(dbPath);
  try {
    return getSchemaVersion(db);
  } finally {
    db.close();
  }
}

// The X session is reported informationally and is never a required check. Last-sync time is the
// meaningful freshness signal. The raw `connected` flag is shown with a caveat: ft 1.3.19 reports it
// false even when Chrome-session sync works, so it is not an authoritative X-login check, and a
// connected=false alone does not raise a warning.
function buildSessionCheck(session: FtSessionStatus): CheckResult {
  const connectedStr = session.connected === undefined ? "unknown" : String(session.connected);
  const caveat = `ft session connected=${connectedStr} (informational only, not an authoritative X login; confirm a live login with \`reading sync --pull\`)`;
  if (!session.available) {
    return {
      name: "Field Theory session",
      status: "warn",
      detail: "could not read `ft status --json`",
      remediation: "run `ft status --json` to confirm ft is reachable",
      required: false,
    };
  }
  if (session.lastUpdated) {
    return {
      name: "Field Theory session",
      status: "pass",
      detail: `last synced ${session.lastUpdated}; ${caveat}`,
      required: false,
    };
  }
  return {
    name: "Field Theory session",
    status: "warn",
    detail: `no sync recorded yet; ${caveat}`,
    remediation: "run `reading sync --pull` to fetch bookmarks from X",
    required: false,
  };
}
