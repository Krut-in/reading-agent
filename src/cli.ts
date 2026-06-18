#!/usr/bin/env node
import { Command } from "commander";
import { realClock } from "./clock";
import { runCandidates } from "./commands/candidates";
import type { CheckResult } from "./commands/doctor";
import { runDoctor } from "./commands/doctor";
import { type HomeResult, runHome } from "./commands/home";
import { type MarkResult, runMark } from "./commands/mark";
import { runProfileReview } from "./commands/profile-review";
import { type RunLogEntry, runRunLog } from "./commands/run-log";
import type { SetupResult } from "./commands/setup";
import { runSetup } from "./commands/setup";
import { type SyncCommandResult, runSync } from "./commands/sync";
import { type TopicWriteResult, runTopicWrite } from "./commands/topic-write";
import { type WriteResult, runWrite } from "./commands/write";
import { resolveConfig } from "./config";
import { realProbes } from "./env";

const program = new Command();

program
  .name("reading")
  .description("Personal X/Twitter bookmark reading agent (judgment layer over Field Theory)")
  .version("0.1.0");

program
  .command("setup")
  .description("Create vault folders, reading.db, and seeded System files (idempotent)")
  .action(() => {
    const config = resolveConfig();
    printSetup(runSetup(config));
  });

program
  .command("doctor")
  .description("Read-only setup diagnostics. Exits nonzero on a required failure.")
  .action(() => {
    const config = resolveConfig();
    const report = runDoctor(config, realProbes);
    printDoctor(report.checks);
    process.stdout.write(
      `\n${report.ok ? "OK: required checks passed." : "FAIL: a required check failed."}\n`,
    );
    process.exitCode = report.ok ? 0 : 1;
  });

program
  .command("sync")
  .description("Ingest the local Field Theory corpus into reading state (new items become unread)")
  .option("--pull", "run `ft sync --no-media` first to fetch new bookmarks from X")
  .option("--gaps", "with --pull, also backfill linked-article text (ft sync --gaps)")
  .option("--with-media", "with --pull, allow media download (default skips it to save disk)")
  .option(
    "--manual <file.jsonl>",
    "ingest from a JSONL dump instead of Field Theory (fallback when session sync breaks)",
  )
  .action(
    async (opts: { pull?: boolean; gaps?: boolean; withMedia?: boolean; manual?: string }) => {
      const config = resolveConfig();
      const result = await runSync(config, {
        pull: opts.pull,
        gaps: opts.gaps,
        withMedia: opts.withMedia,
        manual: opts.manual,
      });
      printSync(result);
    },
  );

program
  .command("candidates")
  .description("Print the ranking-ready unread candidate set as JSON for Claude Code")
  .option("--limit <n>", "limit the number of candidates", (value) => Number.parseInt(value, 10))
  .option("--order <order>", "sort order: newest (default) or oldest (for resurfacing)")
  .option("--before <YYYY-MM-DD>", "keep only items posted before this date (UTC)")
  .action(async (opts: { limit?: number; order?: string; before?: string }) => {
    const config = resolveConfig();
    if (opts.order !== undefined && opts.order !== "newest" && opts.order !== "oldest") {
      throw new Error(
        `reading candidates: invalid --order "${opts.order}" (expected newest or oldest)`,
      );
    }
    const order = (opts.order ?? "newest") as "newest" | "oldest";
    const candidates = await runCandidates(config, {
      limit: opts.limit,
      order,
      before: opts.before,
    });
    process.stderr.write(`reading candidates: ${candidates.length} unread item(s)\n`);
    process.stdout.write(`${JSON.stringify(candidates, null, 2)}\n`);
  });

program
  .command("home")
  .description("Render the dynamic System/Reading-Home.md from current reading state")
  .action(() => {
    const config = resolveConfig();
    printHome(runHome(config));
  });

program
  .command("mark")
  .description("Set an item's reading status by id, then refresh Reading-Home")
  .requiredOption("--id <id>", "the stable item id (matches the item-note frontmatter id)")
  .option("--read", "mark the item read")
  .option("--shared", "mark the item shared")
  .option("--skipped", "mark the item skipped")
  .action((opts: { id: string; read?: boolean; shared?: boolean; skipped?: boolean }) => {
    const config = resolveConfig();
    printMark(runMark(config, opts));
  });

program
  .command("write")
  .description("Render item notes and the queue note from a picks JSON, then record reading state")
  .requiredOption("--picks <file>", "path to the picks JSON produced by the judgment skill")
  .action((opts: { picks: string }) => {
    const config = resolveConfig();
    printWrite(runWrite(config, { picksPath: opts.picks, clock: realClock }));
  });

program
  .command("topic:write")
  .description("Render Topics/<slug>.md from a topic JSON and record the topic and its item links")
  .requiredOption("--input <file>", "path to the topic JSON produced by the connect-topic skill")
  .option("--topic <name>", "topic display name (overrides the JSON topic)")
  .option("--slug <slug>", "explicit slug (overrides the slug derived from the topic name)")
  .action((opts: { input: string; topic?: string; slug?: string }) => {
    const config = resolveConfig();
    const result = runTopicWrite(config, {
      inputPath: opts.input,
      topic: opts.topic,
      slug: opts.slug,
    });
    if (result.skipped.length > 0) {
      process.stderr.write(
        `reading topic:write: ${result.skipped.length} related id(s) not in reading.db, linked as plain links only: ${result.skipped.join(", ")}\n`,
      );
    }
    printTopicWrite(result);
  });

program
  .command("profile:review")
  .description("Print read-only learning-loop signals as JSON for the review-profile skill")
  .option("--json", "output JSON (the default and only format)")
  .action(async () => {
    const config = resolveConfig();
    const review = await runProfileReview(config);
    const t = review.totals;
    process.stderr.write(
      `reading profile:review: ${t.read ?? 0} read, ${t.shared ?? 0} shared, ${t.skipped ?? 0} skipped, ${review.queued_stale.length} queued-stale\n`,
    );
    process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
  });

program
  .command("run:log")
  .description("List recent curation runs (read-only history; the append side is `reading write`)")
  .option("--limit <n>", "max runs to show (default 10)", (value) => Number.parseInt(value, 10))
  .action((opts: { limit?: number }) => {
    const config = resolveConfig();
    printRunLog(runRunLog(config, { limit: opts.limit }));
  });

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

function printSync(result: SyncCommandResult): void {
  const sourceLabel =
    result.sourceId === "manual-export"
      ? "manual-export (local JSONL dump)"
      : `field-theory${result.pulled ? " (pulled via ft sync --no-media)" : " (local read)"}`;
  const lines = [
    "reading sync",
    `  source: ${sourceLabel}`,
    `  corpus: ${result.total} bookmarks`,
    `  new:    ${result.inserted} recorded as unread`,
    `  known:  ${result.existing} already tracked`,
    `  unread total: ${result.unreadTotal}`,
    `  home:   ${result.homeWritten}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printHome(result: HomeResult): void {
  const lines = [
    "reading home",
    `  gems waiting: ${result.gemCount}`,
    `  top pick:     ${result.topPickId ?? "none yet"}`,
    `  wrote:        ${result.written}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printMark(result: MarkResult): void {
  const unchanged = result.previousStatus === result.newStatus ? " (unchanged)" : "";
  const lines = [
    "reading mark",
    `  id:     ${result.id}`,
    `  status: ${result.newStatus} (was ${result.previousStatus})${unchanged}`,
    `  home:   ${result.homeWritten}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printWrite(result: WriteResult): void {
  const lines = [
    "reading write",
    `  run:    ${result.runId} (${result.kind})`,
    `  queued: ${result.queued} new, ${result.reused} refreshed`,
    `  items:  ${result.itemNotesWritten.length} note(s) in Items/`,
    `  queue:  ${result.queueNoteWritten ?? "none"}`,
    `  home:   ${result.homeWritten}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printTopicWrite(result: TopicWriteResult): void {
  const lines = [
    "reading topic:write",
    `  topic:  ${result.topic} (${result.slug})`,
    `  note:   ${result.notePath}`,
    `  linked: ${result.linked} saved item(s)`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printRunLog(entries: RunLogEntry[]): void {
  if (entries.length === 0) {
    process.stdout.write("reading run:log\n  no curation runs recorded yet\n");
    return;
  }
  const lines: string[] = ["reading run:log"];
  for (const e of entries) {
    const noun = e.itemCount === 1 ? "item" : "items";
    const when = e.createdAt ?? "(no date)";
    lines.push(`  ${when}  ${e.id} (${e.kind ?? "unknown"})  ${e.itemCount} ${noun}`);
    if (e.summary) {
      lines.push(`    ${e.summary}`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printSetup(result: SetupResult): void {
  const lines: string[] = [];
  lines.push("reading setup");
  lines.push(`  vault: ${result.vaultRoot}`);
  lines.push(`  db:    ${result.dbPath} (schema v${result.schemaVersion})`);
  lines.push(describeList("folders created", result.foldersCreated));
  lines.push(describeList("folders present", result.foldersExisting));
  lines.push(describeList("files created", result.filesCreated));
  lines.push(describeList("files present", result.filesExisting));
  lines.push(`  home:  ${result.homeWritten}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function describeList(label: string, items: string[]): string {
  if (items.length === 0) {
    return `  ${label}: none`;
  }
  return `  ${label}: ${items.join(", ")}`;
}

function printDoctor(checks: CheckResult[]): void {
  const label: Record<CheckResult["status"], string> = {
    pass: "[PASS]",
    warn: "[WARN]",
    fail: "[FAIL]",
  };
  const lines: string[] = ["reading doctor"];
  for (const check of checks) {
    lines.push(`  ${label[check.status]} ${check.name}: ${check.detail}`);
    if (check.remediation) {
      lines.push(`         -> ${check.remediation}`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
