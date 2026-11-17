// The AI module's server side: the AI endpoint (/api/ai), the monthly allowance per person, the
// usage ledger and the `set-allowance` admin command. Loaded by the web pack's module loader.
import type { Context } from "hono";
import { normalizeEmail } from "../accounts.js";
import { ipOf } from "../auth.js";
import { setAllowance, type CapPeriod } from "../ai/ledger.js";
import { aiRoutes, type AiDeps, type SiteCap } from "../ai/routes.js";
import { anthropicUpstream, type AiUpstream } from "../ai/upstream.js";
import type { ModuleFactory, ServerModule } from "../module-loader.js";

/** The only place that names the default AI models; AI_MODEL_QUICK / AI_MODEL_DEFAULT override them. */
export const DEFAULT_MODELS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5" } as const;

export interface AiConfig {
  /** Anthropic key for the ai. Server-side only; null leaves the ai off. */
  anthropicApiKey: string | null;
  models: { quick: string; default: string };
  /** AI tokens per person per month when the admin has not set one. */
  defaultMonthlyAllowance: number;
  /** AI_SITE_CAP_TOKENS set: the site-wide cap (tokens per day or month, all visitors together). */
  siteCap: Omit<SiteCap, "allowAnonymous"> | null;
  /** SIGN_IN_MODE=none with a site cap: visitors need no sign-in to use the AI. */
  allowAnonymous: boolean;
  /** TRUST_PROXY=1: read the visitor's address from X-Forwarded-For. */
  trustProxy: boolean;
}

const COUNT = /^\d{1,15}$/;

export function aiConfig(env: NodeJS.ProcessEnv): AiConfig {
  const rawAllowance = env.AI_DEFAULT_ALLOWANCE ?? "200000";
  if (!/^\d{1,12}$/.test(rawAllowance)) throw new Error("AI_DEFAULT_ALLOWANCE is not valid");
  const rawCap = env.AI_SITE_CAP_TOKENS || null;
  if (rawCap !== null && (!COUNT.test(rawCap) || Number(rawCap) <= 0))
    throw new Error("AI_SITE_CAP_TOKENS is not valid (a whole number above 0, or leave it unset)");
  const period = env.AI_SITE_CAP_PERIOD || "day";
  if (period !== "day" && period !== "month")
    throw new Error('AI_SITE_CAP_PERIOD must be "day" or "month"');
  const rawAddr = env.AI_PER_ADDRESS_TOKENS || null;
  if (rawAddr !== null && (!COUNT.test(rawAddr) || Number(rawAddr) <= 0))
    throw new Error(
      "AI_PER_ADDRESS_TOKENS is not valid (a whole number above 0, or leave it unset)",
    );
  if (rawAddr !== null && rawCap === null)
    throw new Error("AI_PER_ADDRESS_TOKENS needs AI_SITE_CAP_TOKENS");
  return {
    siteCap:
      rawCap === null
        ? null
        : {
            tokens: Number(rawCap),
            period: period as CapPeriod,
            perAddressTokens: rawAddr === null ? null : Number(rawAddr),
          },
    allowAnonymous: rawCap !== null && env.SIGN_IN_MODE === "none",
    trustProxy: env.TRUST_PROXY === "1",
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
    models: {
      quick: env.AI_MODEL_QUICK || DEFAULT_MODELS.quick,
      default: env.AI_MODEL_DEFAULT || DEFAULT_MODELS.default,
    },
    defaultMonthlyAllowance: Number(rawAllowance),
  };
}

/** The module for given dependencies (the tests build it with a scripted upstream). */
export function aiModule(deps: AiDeps): ServerModule {
  return {
    name: "ai",
    routes: (resolveUser: (c: Context) => string | null | Promise<string | null>) =>
      aiRoutes(deps, resolveUser),
    admin: {
      "set-allowance": {
        usage:
          'set-allowance <email> <tokens>  AI tokens per month for one person ("default" to clear)',
        run: async (args, pool) => {
          const email = normalizeEmail(args[0]);
          const raw = args[1];
          const tokens =
            raw === "default" ? null : /^\d{1,15}$/.test(raw ?? "") ? Number(raw) : NaN;
          if (!email || Number.isNaN(tokens))
            throw new Error('usage: set-allowance <email> <tokens|"default">');
          if (!(await setAllowance(pool, email, tokens)))
            throw new Error("no account with that email");
          return `${email}: ${tokens === null ? "server default" : `${tokens} tokens per month`}`;
        },
      },
    },
    userNotes: async (pool) => {
      const r = await pool.query("SELECT email, monthly_allowance FROM users");
      return new Map(
        r.rows.map((x) => [
          x.email as string,
          `allowance: ${x.monthly_allowance === null ? "default" : String(Number(x.monthly_allowance))}`,
        ]),
      );
    },
    onDeleteUser: async (client, userId) => {
      await client.query("DELETE FROM ai_usage WHERE user_id = $1", [userId]);
    },
  };
}

const setup: ModuleFactory = ({ pool, env, override }) => {
  const c = aiConfig(env);
  // A test server hands in a scripted upstream (`e2e/modules/ai.ts`); otherwise the key decides.
  const upstream =
    "upstream" in override
      ? (override.upstream as AiUpstream | null)
      : c.anthropicApiKey
        ? anthropicUpstream(c.anthropicApiKey)
        : null;
  return aiModule({
    pool,
    upstream,
    models: c.models,
    defaultAllowance: c.defaultMonthlyAllowance,
    siteCap: c.siteCap && { ...c.siteCap, allowAnonymous: c.allowAnonymous },
    clientIp: (ctx) => ipOf(ctx, c.trustProxy),
  });
};
export default setup;
