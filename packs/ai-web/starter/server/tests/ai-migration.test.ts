import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/db.js";

const url = process.env.TEST_DATABASE_URL;
const schema = `t_${Math.random().toString(36).slice(2, 10)}`;
const MIGRATION = "ai_001_usage.sql";

// An app that had the AI before it became a module: the old 002 and 003 migrations already ran
// and left `users.monthly_allowance` and `ai_usage`, with data in them.
describe.skipIf(!url)("ai module migration on a database that already has the AI", () => {
  let pool: pg.Pool;
  let dir: URL;

  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(`
      CREATE TABLE users (id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
        monthly_allowance bigint CHECK (monthly_allowance IS NULL OR monthly_allowance >= 0),
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE ai_usage (user_id text NOT NULL, month date NOT NULL,
        tokens bigint NOT NULL DEFAULT 0 CHECK (tokens >= 0), PRIMARY KEY (user_id, month));
      CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO schema_migrations (name) VALUES ('001_documents.sql'), ('002_auth.sql'), ('003_ai_usage.sql');
      INSERT INTO users (id, email, password_hash, monthly_allowance) VALUES ('u1', 'a@example.com', 'x', 42);
      INSERT INTO ai_usage (user_id, month, tokens) VALUES ('u1', '2026-11-01', 7);`);
    // A migrations folder holding only the module's file, so the old ones are not needed.
    const tmp = await mkdtemp(join(tmpdir(), "mig-"));
    await writeFile(
      join(tmp, MIGRATION),
      await readFile(new URL(`../migrations/${MIGRATION}`, import.meta.url), "utf8"),
    );
    dir = new URL(`${pathToFileURL(tmp).href}/`);
  });
  afterAll(async () => {
    await pool.end();
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("runs without error and keeps the allowance and the usage", async () => {
    expect(await migrate(pool, dir)).toEqual([MIGRATION]);
    expect(
      (await pool.query("SELECT monthly_allowance FROM users")).rows[0].monthly_allowance,
    ).toBe("42");
    expect((await pool.query("SELECT tokens FROM ai_usage")).rows[0].tokens).toBe("7");
  });

  it("is safe to run again", async () => {
    await pool.query("DELETE FROM schema_migrations WHERE name = $1", [MIGRATION]);
    expect(await migrate(pool, dir)).toEqual([MIGRATION]);
    expect((await pool.query("SELECT count(*)::int AS n FROM ai_usage")).rows[0].n).toBe(1);
  });
});
