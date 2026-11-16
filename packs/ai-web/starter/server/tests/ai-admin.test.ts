import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/admin.js";
import { migrate } from "../src/db.js";
import aiSetup from "../src/modules/ai.js";
import { ensureAccount } from "../src/accounts.js";
import type { ServerModule } from "../src/module-loader.js";

const url = process.env.TEST_DATABASE_URL;
const schema = `t_${Math.random().toString(36).slice(2, 10)}`;

describe.skipIf(!url)("ai module: admin command and account data", () => {
  let pool: pg.Pool;
  let modules: ServerModule[];

  const signUp = async (email: string): Promise<string> => {
    await ensureAccount(pool, email, "correct horse battery");
    return (await pool.query("SELECT id FROM users WHERE email = $1", [email])).rows[0]
      .id as string;
  };

  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await migrate(pool);
    modules = [await aiSetup({ pool, env: {}, override: {} })];
  });
  afterAll(async () => {
    await pool.end();
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("sets and clears an allowance, and shows it in list-users", async () => {
    await signUp("carla@example.com");
    await run(["set-allowance", "carla@example.com", "50000"], pool, "", modules);
    expect(await run(["list-users"], pool, "", modules)).toMatch(
      /carla@example.com {2}allowance: 50000 {2}since/,
    );
    await run(["set-allowance", "carla@example.com", "default"], pool, "", modules);
    expect(await run(["list-users"], pool, "", modules)).toMatch(
      /carla@example.com {2}allowance: default/,
    );
    await expect(
      run(["set-allowance", "carla@example.com", "-5"], pool, "", modules),
    ).rejects.toThrow(/usage/);
    await expect(
      run(["set-allowance", "ghost@example.com", "5"], pool, "", modules),
    ).rejects.toThrow(/no account/);
    expect(await run([], pool, "", modules)).toMatch(/set-allowance/);
  });

  it("delete-user also removes that person's AI usage, and only theirs", async () => {
    const id = await signUp("gone@example.com");
    const keep = (await pool.query("SELECT id FROM users WHERE email = 'carla@example.com'"))
      .rows[0].id as string;
    for (const u of [id, keep])
      await pool.query("INSERT INTO ai_usage (user_id, month, tokens) VALUES ($1, now(), 5)", [u]);
    expect(await run(["delete-user", "gone@example.com"], pool, "", modules)).toMatch(/Deleted/);
    expect((await pool.query("SELECT 1 FROM ai_usage WHERE user_id = $1", [id])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM ai_usage WHERE user_id = $1", [keep])).rowCount).toBe(
      1,
    );
  });
});
