import { checkPassword, normalizeEmail } from "./accounts.js";

export interface Config {
  databaseUrl: string;
  port: number;
  version: string;
  /** Signed-in user for every request when no session cookie is present. Dev and tests only. */
  testUserId: string | null;
  /** Session cookie is HTTPS-only. On unless NODE_ENV is not production and COOKIE_SECURE=0. */
  secureCookie: boolean;
  /** Base address for invite links the admin command prints. */
  publicUrl: string;
  /** Behind exactly one trusted proxy (TRUST_PROXY=1): read the client address from X-Forwarded-For. */
  trustProxy: boolean;
  /** Opt-in test account (TEST_ACCOUNT_PASSWORD); null on every server that doesn't ask. */
  testAccount: { email: string; password: string } | null;
  /** Folder with the built web app (WEB_DIR); null serves the API only. */
  webDir: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv, version: string): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT is not valid");
  const testUserId = env.AUTH_TEST_USER_ID || null;
  if (testUserId && env.NODE_ENV === "production" && env.ALLOW_TEST_USER !== "1") {
    throw new Error(
      "AUTH_TEST_USER_ID is not allowed in production (set ALLOW_TEST_USER=1 to override)",
    );
  }
  const secureCookie = !(env.NODE_ENV !== "production" && env.COOKIE_SECURE === "0");
  const publicUrl = (
    env.PUBLIC_URL ||
    env.RENDER_EXTERNAL_URL ||
    `http://localhost:${port}`
  ).replace(/\/+$/, "");
  let testAccount: Config["testAccount"] = null;
  if (env.TEST_ACCOUNT_PASSWORD) {
    const email = normalizeEmail(env.TEST_ACCOUNT_EMAIL || "test@example.com");
    const password = checkPassword(env.TEST_ACCOUNT_PASSWORD);
    if (!email) throw new Error("TEST_ACCOUNT_EMAIL is not valid");
    if (!password) throw new Error("TEST_ACCOUNT_PASSWORD must be 10 to 200 characters");
    testAccount = { email, password };
  }
  return {
    databaseUrl,
    port,
    version,
    testUserId,
    secureCookie,
    publicUrl,
    trustProxy: env.TRUST_PROXY === "1",
    testAccount,
    webDir: env.WEB_DIR || null,
  };
}
