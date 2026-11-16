import type { Context } from "hono";
import type pg from "pg";
import { createApp } from "./app.js";
import { createAuth, ipOf } from "./auth.js";
import type { Config } from "./config.js";
import type { ServerModule } from "./module-loader.js";

/** The whole server for one config. The e2e server calls this with modules set up for tests. */
export function buildApp(
  pool: pg.Pool,
  config: Config,
  modules: ServerModule[] = [],
  webDir?: string,
) {
  const shared = {
    pool,
    version: config.version,
    signIn: config.signIn,
    clientIp: (c: Context) => ipOf(c, config.trustProxy),
    modules,
    webDir,
    https: config.secureCookie,
  };
  // No login: no sign-in routes, and nobody is ever signed in.
  if (config.signIn === "none") return createApp({ ...shared, resolveUser: () => null });
  const auth = createAuth(pool, {
    mode: config.signIn,
    secureCookie: config.secureCookie,
    trustProxy: config.trustProxy,
  });
  return createApp({
    ...shared,
    // A real session wins; the test user only fills in when AUTH_TEST_USER_ID is set.
    resolveUser: async (c) => (await auth.resolveUser(c)) ?? config.testUserId,
    authRoutes: auth.routes,
  });
}
