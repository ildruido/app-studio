import { readdirSync } from "node:fs";
import type { Context, Hono } from "hono";
import type pg from "pg";

/** Who is calling? null means not signed in. */
export type ResolveUser = (c: Context) => string | null | Promise<string | null>;

export interface AdminCommand {
  /** One line for the admin command's help. */
  usage: string;
  run(args: string[], pool: pg.Pool): Promise<string>;
}

/**
 * What a feature module adds to the server. A module is one file in `src/modules/` whose default
 * export is a `ModuleFactory`; the web pack never names any module, it loads whatever is there.
 * A module's tables go in `migrations/<name>_NNN_*.sql` (they run after the web pack's own).
 */
export interface ServerModule {
  /** Lowercase letters, digits and hyphens; also the module's route prefix (`/api/<name>`). */
  name: string;
  /** Routes, mounted at `/api/<name>`. Call `resolveUser` to require sign-in. */
  routes?(resolveUser: ResolveUser): Hono;
  /** Extra admin commands, by command name. */
  admin?: Record<string, AdminCommand>;
  /** Text added after an account's email in `list-users` (by email). */
  userNotes?(pool: pg.Pool): Promise<Map<string, string>>;
  /** Removes the module's data for one person, in the transaction that deletes the account. */
  onDeleteUser?(client: pg.PoolClient, userId: string): Promise<void>;
}

export interface ModuleSetup {
  pool: pg.Pool;
  env: NodeJS.ProcessEnv;
  /** Test hooks for this module (the e2e server's scripted services); empty in production. */
  override: Record<string, unknown>;
}

export type ModuleFactory = (setup: ModuleSetup) => ServerModule | Promise<ServerModule>;

/** The folder next to this file: `src/modules/` from source, `dist/src/modules/` once built. */
export const MODULES_DIR = new URL("modules/", import.meta.url);

const NAME = /^[a-z][a-z0-9-]*$/;

/** The module files in a folder (.ts or .js, no type files or tests), in name order. */
export function moduleFiles(dir: URL = MODULES_DIR): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return []; // no modules folder: an app with no modules
  }
  return names.filter((f) => /\.(ts|js)$/.test(f) && !/\.(d|test)\.(ts|js)$/.test(f)).sort();
}

/** Loads and sets up every module in the folder. `overrides` is keyed by file name without extension. */
export async function loadModules(
  setup: {
    pool: pg.Pool;
    env: NodeJS.ProcessEnv;
    overrides?: Record<string, Record<string, unknown>>;
  },
  dir: URL = MODULES_DIR,
): Promise<ServerModule[]> {
  const out: ServerModule[] = [];
  for (const file of moduleFiles(dir)) {
    const base = file.replace(/\.(ts|js)$/, "");
    const mod = (await import(new URL(file, dir).href)) as { default?: unknown };
    if (typeof mod.default !== "function")
      throw new Error(`modules/${file} must export a module factory as its default export`);
    const m = await (mod.default as ModuleFactory)({
      pool: setup.pool,
      env: setup.env,
      override: setup.overrides?.[base] ?? {},
    });
    if (!NAME.test(m.name) || m.name !== base)
      throw new Error(
        `modules/${file}: the module name must be "${base}" (lowercase, digits, hyphens)`,
      );
    out.push(m);
  }
  return out;
}
