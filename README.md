# Reading Agent

A local TypeScript CLI for turning a Field Theory X/Twitter bookmark corpus into a small reading queue and Obsidian-flavored Markdown notes.

## Privacy Model

This repository is intended to contain code only. Personal bookmark data, generated vault notes, daily queues, run outputs, SQLite databases, Obsidian workspace state, and local exports are ignored by Git.

The CLI reads bookmark data from Field Theory and stores reading state locally. It does not require committing bookmark content to this repository.

## Setup

```sh
npm install
npm run build
```

Set the vault location explicitly when running outside the target vault directory:

```sh
READING_VAULT=/path/to/your/vault npm run dev -- doctor
```

## Useful Commands

```sh
npm run test
npm run typecheck
npm run build
```
