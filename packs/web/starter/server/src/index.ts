import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import pg from "pg";
import { bootstrapInvite, ensureTestAccount } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { migrate } from "./db.js";
import { loadModules } from "./module-loader.js";
import { serverRoot } from "./root.js";
import { buildApp } from "./wire.js";

const root = serverRoot();
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
  version: string;
};
const config = loadConfig(process.env, pkg.version);
const pool = new pg.Pool({ connectionString: config.databaseUrl });
console.warn(`sign-in: ${config.signIn}`);

const applied = await migrate(pool);
if (applied.length) console.warn("migrations applied:", applied.join(", "));

// The first invite is only for invite-only sign-in: with open sign-up the owner signs up like anyone.
if (process.env.BOOTSTRAP_INVITE === "1" && config.signIn === "invite") {
  const line = await bootstrapInvite(pool, config.publicUrl);
  if (line) console.warn(line);
}

if (config.testAccount) console.warn(await ensureTestAccount(pool, config.testAccount));

// WEB_DIR, else the repo's own build when running from a checkout.
const checkoutBuild = fileURLToPath(new URL("../dist-web", root));
const webDir = config.webDir ?? (existsSync(checkoutBuild) ? checkoutBuild : undefined);
if (!webDir) console.warn("no web app to serve (set WEB_DIR); answering the API only");

const modules = await loadModules({ pool, env: process.env });
if (modules.length) console.warn("modules:", modules.map((m) => m.name).join(", "));

const app = buildApp(pool, config, modules, webDir);
serve({ fetch: app.fetch, port: config.port }, (info) => console.warn(`listening on ${info.port}`));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => void pool.end().finally(() => process.exit(0)));
}
