export interface SeedFile {
  // Path relative to the vault root.
  relPath: string;
  content: string;
}

// Static System files seeded by `reading setup`. They encode the operating model as human-readable
// notes.
// Setup writes each only if it is absent, so re-running never clobbers user edits. Reading-Home is
// not seeded here; `reading home` renders it dynamically from reading.db (M3), so it stays the
// single source of truth and never lingers as a stale placeholder.
export const SEED_FILES: SeedFile[] = [
  {
    relPath: "System/profile.md",
    content: `# Profile

Priority topics: add the themes this reading queue should prefer. Start broad, then narrow the
profile as real read and share signals accumulate.

How this profile changes:
- It can be inferred from bookmark data.
- Manual edits here override inference.
- A read raises interest confidence for similar items.
- A shared raises it strongly.
- Items queued repeatedly but left unread lower confidence for similar items.

Updates stay conservative and reviewable. The /reading-review-profile command proposes changes for
approval instead of rewriting preferences on its own.
`,
  },
  {
    relPath: "System/ranking-rubric.md",
    content: `# Ranking Rubric

High value means the item is worth the user's limited reading attention right now.

Weights:
- Usefulness: 40 percent
- Interest: 30 percent
- Popularity: 15 percent
- Recency: 15 percent

Signals:
- Usefulness: helps current learning, work, or life. A clear reason to read now. Could affect a
  decision, project, workflow, or conversation.
- Interest: matches topics the user bookmarks, reads, and shares; connects to other saved items.
- Popularity: influential author, project, paper, or repo, with visible traction and broad current
  relevance. It helps ranking but never overrides personal interest.
- Recency: new or newly relevant, especially in fast-moving areas.

Penalties: too long for the session, similar to something recently queued, already read, vague
title or unclear payoff, weak source context, previously selected but not read, low profile fit.

Scores are rubric-guided judgments produced by Claude Code, not deterministic numbers. They order a
small set and do not imply precision. Field Theory classification feeds usefulness and interest.
`,
  },
  {
    relPath: "System/curation-rules.md",
    content: `# Curation Rules

Each curation run checks:
- Does each item have a clear reason to read?
- Does the curiosity pitch encourage reading without replacing it?
- Is the set balanced across topics and effort?
- Are already-read items excluded?
- Are duplicates avoided?
- Are recent claims verified when needed?
- Is at least one older item considered?
- Are vault links present?
- Does Reading-Home reflect the current state?
`,
  },
  {
    relPath: "System/config.md",
    content: `# Config

Vault root: this folder.
Reading-state database: reading.db at the vault root.
Source of truth for this installation: local project notes and the generated reading state.

Reading session defaults:
- Read-now set size: 1 to 5 items, based on available time.
- Ask or infer available time before selecting.

This file is static notes for humans. The CLI does not parse it in M1.
`,
  },
  {
    relPath: "System/sources.md",
    content: `# Sources

The single ingestion source is Field Theory. It owns sync, storage, search, classification,
Markdown export, and the knowledge base. We never reimplement any of those.

We read the corpus through Field Theory and never write to ~/.fieldtheory/. We never modify or
delete a source bookmark.

A manual-export fallback covers the case where session-based sync breaks. Pass a JSONL dump (the
same shape as Field Theory's bookmarks.jsonl) with \`reading sync --manual <file.jsonl>\`. CSV is
deferred; the realistic fallback is a JSONL cache dump.
`,
  },
];
