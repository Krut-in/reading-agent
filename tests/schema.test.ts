import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, getSchemaVersion, initSchema } from "../src/db/schema";

function tableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe("initSchema", () => {
  it("creates the sketched tables and stamps the schema version", () => {
    const db = new Database(":memory:");
    const version = initSchema(db);
    expect(version).toBe(SCHEMA_VERSION);
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);

    const tables = tableNames(db);
    for (const name of ["items", "topics", "item_topics", "curation_runs", "run_items"]) {
      expect(tables).toContain(name);
    }
    db.close();
  });

  it("is idempotent on a second run", () => {
    const db = new Database(":memory:");
    initSchema(db);
    expect(() => initSchema(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("enforces the item status check constraint", () => {
    const db = new Database(":memory:");
    initSchema(db);
    const insert = db.prepare("INSERT INTO items (id, status) VALUES (?, ?)");
    expect(() => insert.run("bad", "bogus")).toThrow();
    expect(() => insert.run("good", "unread")).not.toThrow();
    db.close();
  });
});
