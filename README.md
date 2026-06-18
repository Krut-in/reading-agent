# Reading Agent

A local TypeScript CLI for turning an X/Twitter bookmark backlog into a small, trusted reading queue.

The project sits between [Field Theory CLI](https://www.fieldtheory.dev/cli/), an Obsidian-style Markdown vault, and an AI-assisted curation workflow. Field Theory owns bookmark capture and search. `reading` owns local reading state, queue rendering, and the deterministic file/database writes that happen after a curation decision.

## Why This Exists

Bookmarking is easy. Returning to the right bookmark later is the hard part.

This tool is built around a simple loop:

1. Capture saved X/Twitter bookmarks with Field Theory.
2. Record unread items in a local SQLite reading-state database.
3. Produce ranking-ready candidates for an agent or human reviewer.
4. Write selected picks into Markdown notes with a short reason to read.
5. Mark what happened: read, shared, skipped, or still queued.

The goal is not to read everything or turn every bookmark into a task. The goal is to surface a few useful next reads with enough context that opening the original link feels easy.

## How It Fits Together

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Bookmark corpus | Field Theory (`ft`) | Syncs X/Twitter bookmarks locally, searches them, classifies them, and exposes JSONL/Markdown data. |
| Reading state | `reading.db` | Tracks item status, queue history, scores, topics, and curation runs. |
| Rendering | `reading` CLI | Writes `System/`, `Daily/`, `Items/`, `Topics/`, and `Runs/` Markdown outputs. |
| Judgment | Agent workflow or reviewer | Chooses what is worth reading and returns structured picks. |
| Reading surface | Obsidian or any Markdown editor | Shows the Reading Home, daily queues, item notes, and topic notes. |

The important boundary: this project reads the Field Theory corpus but never edits or deletes source bookmarks.

## What Gets Written

A normal vault produced by this tool uses these folders:

```text
System/      # Reading-Home, profile, rules, and source notes
Daily/       # dated queues: read-now, prepared queues, resurfaced gems
Items/       # one Markdown note per picked item
Topics/      # synthesis notes that connect saved items
Runs/        # picks JSON audit trail for each curation run
Archive/     # optional retired notes
reading.db   # local SQLite reading state
```

Those folders are intentionally ignored in this public repository. They are user data, not source code.

## Requirements

- Node.js 20+
- npm
- Field Theory CLI installed and able to read your local bookmark corpus
- Optional: Obsidian, if you want the Markdown vault experience

Install Field Theory separately and confirm it works before relying on `reading sync --pull`.

## Setup

Clone the repo and install dependencies:

```sh
git clone https://github.com/Krut-in/reading-agent.git
cd reading-agent
npm install
npm run build
```

Run the CLI from source during development:

```sh
npm run dev -- doctor
```

When your vault is somewhere else, point the CLI at it explicitly:

```sh
READING_VAULT=/path/to/your/vault npm run dev -- doctor
```

Initialize a new vault/state directory:

```sh
READING_VAULT=/path/to/your/vault npm run dev -- setup
```

`setup` is idempotent. It creates folders, the SQLite schema, starter system files, and the dynamic Reading Home without overwriting edited notes.

## First Workflow

Run a health check:

```sh
npm run dev -- doctor
```

Record bookmarks from the local Field Theory cache:

```sh
npm run dev -- sync
```

Pull fresh bookmarks through Field Theory first, then record new unread items:

```sh
npm run dev -- sync --pull
```

Print candidates for ranking:

```sh
npm run dev -- candidates --limit 25
```

After a curation workflow produces a picks JSON file, render notes and update state:

```sh
npm run dev -- write --picks picks.json
```

After reading an item, close the loop:

```sh
npm run dev -- mark --id <item-id> --read
```

Use `--shared` for especially valuable items and `--skipped` for items you no longer intend to read.

## Command Map

| Command | Purpose |
| --- | --- |
| `reading setup` | Creates vault folders, `reading.db`, starter system files, and Reading Home. |
| `reading doctor` | Read-only diagnostics for Node, Field Theory, vault folders, database schema, and session metadata. |
| `reading sync` | Reads the local Field Theory cache and records new items as unread. |
| `reading sync --pull` | Runs `ft sync --no-media` first, then records new unread items. |
| `reading candidates` | Prints unread, ranking-ready candidates as JSON. |
| `reading home` | Re-renders `System/Reading-Home.md` from current state. |
| `reading write --picks <file>` | Writes item notes and queue notes from structured picks JSON. |
| `reading mark --id <id> --read` | Marks an item read. Also supports `--shared` and `--skipped`. |
| `reading topic:write --input <file>` | Writes a topic synthesis note from structured topic JSON. |
| `reading profile:review --json` | Prints read-only learning-loop signals for profile review. |
| `reading run:log` | Lists recent curation runs. |

Candidate options:

```sh
npm run dev -- candidates --limit 50
npm run dev -- candidates --order oldest
npm run dev -- candidates --before 2026-06-01
```

Sync options:

```sh
npm run dev -- sync --pull --gaps
npm run dev -- sync --manual /path/to/bookmarks.jsonl
```

`--manual` is the fallback when you already have a JSONL export in the same shape as Field Theory's `bookmarks.jsonl`.

## Picks JSON Shape

`reading write` expects structured output from a curation step. A simplified example:

```json
{
  "kind": "now",
  "available_time_minutes": 30,
  "picks": [
    {
      "id": "bookmark-id",
      "selected_for": "now",
      "content_type": "article",
      "estimated_time_minutes": 8,
      "priority_score": 0.87,
      "usefulness_score": 0.9,
      "interest_score": 0.8,
      "topics": ["AI agents", "memory"],
      "tags": ["reading", "systems"],
      "pitch": {
        "hook": "A useful way to think about memory in agent workflows.",
        "why_now": "It connects to other saved material and is short enough for the session.",
        "bookmark_context": "What the original saved post says.",
        "linked_resource_summary": "What is known about the linked article, repo, video, or paper.",
        "what_you_may_walk_away_knowing": "The concrete payoff for reading it."
      }
    }
  ]
}
```

The CLI validates IDs against the local reading state before writing. Unknown IDs fail closed so a picks file cannot silently create notes for unrelated data.

## Privacy Model

This public repository is code-only by design.

Ignored by Git:

- local SQLite databases: `reading.db`, `*.sqlite`, and related WAL/journal files
- generated vault content: `System/`, `Daily/`, `Items/`, `Topics/`, `Runs/`
- Obsidian workspace state: `.obsidian/`
- Field Theory exports/caches: `*.jsonl`, `bookmarks.db*`, `bookmarks-meta.json`, token-like files
- generated decks, PDFs, reports, build output, and `node_modules/`

The CLI itself does not make direct LLM calls. If you use an external agent workflow to rank or summarize bookmarks, bookmark text and linked-resource content may be sent to that model. Treat saved bookmarks as potentially sensitive and keep generated vault content out of public repos.

## Development

Run the standard checks:

```sh
npm test
npm run typecheck
npm run build
npm run lint
```

The test suite uses synthetic bookmark fixtures. It does not need a real Twitter/X account or a real Field Theory corpus.

## Design Principles

- Keep raw bookmark capture delegated to Field Theory.
- Keep local reading state small and durable.
- Use structured JSON handoffs for judgment-heavy steps.
- Render outputs as portable Markdown.
- Close the loop with explicit status changes.
- Never mutate the source bookmark corpus.

## Current Limitations

- The project is a source-based CLI, not a packaged npm distribution.
- Obsidian checkboxes in generated item notes are visual only; status changes go through `reading mark`.
- Ranking quality depends on the quality of the picks workflow and the user's read/share feedback.
- Topic synthesis expects structured topic JSON from an external workflow.

## License

No license has been declared yet. Treat the code as all rights reserved until a license is added.
