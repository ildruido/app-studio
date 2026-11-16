// The server for the browser tests (e2e/web/): the real app and database, scripted outside services.
// Never part of the production image (the Dockerfile builds only src/), and it refuses to
// start when NODE_ENV=production.
//
// Modules (src/modules/) run as in production; a module that talks to an outside service gets a
// scripted stand-in from e2e/modules/<name>.ts (its default export), so no test needs a real key.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import pg from "pg";
import { createInvite } from "../src/accounts.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/db.js";
import { loadModules, moduleFiles } from "../src/module-loader.js";
import { buildApp } from "../src/wire.js";

if (process.env.NODE_ENV === "production") throw new Error("the e2e server is for tests only");

export const SCHEMA = "e2e_web";

const url = process.env.DATABASE_URL ?? "postgres://postgres:test@localhost:5432/postgres";
const port = Number(process.env.PORT ?? 4175);

const admin = new pg.Pool({ connectionString: url });
await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
await admin.query(`CREATE SCHEMA ${SCHEMA}`);
await admin.end();
const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${SCHEMA}` });
await migrate(pool);

const config = loadConfig(
  {
    DATABASE_URL: url,
    PORT: String(port),
    COOKIE_SECURE: "0",
    PUBLIC_URL: `http://localhost:${port}`,
  },
  "e2e",
);
const overrideDir = new URL("modules/", import.meta.url);
const overrides: Record<string, Record<string, unknown>> = {};
for (const file of moduleFiles(overrideDir)) {
  const mod = (await import(new URL(file, overrideDir).href)) as {
    default: Record<string, unknown>;
  };
  overrides[file.replace(/\.(ts|js)$/, "")] = mod.default;
}
const modules = await loadModules({ pool, env: { DATABASE_URL: url }, overrides });
const real = buildApp(pool, config, modules, process.env.WEB_DIR ?? "../dist-web");
// Tests ask for invites here (the admin command's job in real life). Not in the real server.
const app = new Hono();
app.post("/__e2e/invite", async (c) => c.json({ token: (await createInvite(pool, "e2e")).token }));
app.route("/", real);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) =>
  console.warn(`e2e server on ${info.port}`),
);
