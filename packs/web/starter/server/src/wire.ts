import type pg from "pg";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import type { Config } from "./config.js";
import type { ServerModule } from "./module-loader.js";

/** The whole server for one config. The e2e server calls this with modules set up for tests. */
export function buildApp(
  pool: pg.Pool,
  config: Config,
  modules: ServerModule[] = [],
  webDir?: string,
) {
  const auth = createAuth(pool, {
    secureCookie: config.secureCookie,
    trustProxy: config.trustProxy,
  });
  return createApp({
    pool,
    version: config.version,
    // A real session wins; the test user only fills in when AUTH_TEST_USER_ID is set.
    resolveUser: async (c) => (await auth.resolveUser(c)) ?? config.testUserId,
    authRoutes: auth.routes,
    modules,
    webDir,
    https: config.secureCookie,
  });
}
