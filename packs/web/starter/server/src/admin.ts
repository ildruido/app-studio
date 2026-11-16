import pg from "pg";
import {
  INVITE_DAYS,
  createInvite,
  deleteUser,
  listUsers,
  normalizeEmail,
  randomPassword,
  resetPassword,
  setDisabled,
} from "./accounts.js";
import { loadConfig, type SignInMode } from "./config.js";
import { migrate } from "./db.js";
import { loadModules, type ServerModule } from "./module-loader.js";

const USAGE = `{{title}} admin (run on the server, with DATABASE_URL set)

  invite [note] [--days N]        make a one-use invite link (default ${INVITE_DAYS} days)
  reset-password <email>          set a new random password and sign the person out everywhere
  delete-user <email>             remove an account with its sessions and saved documents
  disable-user <email>            stop an account signing in and sign it out everywhere
  enable-user <email>             let a disabled account sign in again
  list-users                      show accounts`;

const ACCOUNT_COMMANDS = [
  "invite",
  "reset-password",
  "delete-user",
  "disable-user",
  "enable-user",
  "list-users",
];

/** The core commands, then those of the modules in `src/modules/`. */
export async function run(
  args: string[],
  pool: pg.Pool,
  publicUrl: string,
  modules: ServerModule[] = [],
  signIn: SignInMode = "invite",
): Promise<string> {
  const [cmd, ...rest] = args;
  const extra = new Map(modules.flatMap((m) => Object.entries(m.admin ?? {})));
  if (signIn === "none" && cmd && ACCOUNT_COMMANDS.includes(cmd))
    throw new Error("this app has no accounts (SIGN_IN_MODE is none)");
  if (cmd === "invite") {
    const i = rest.indexOf("--days");
    let days = INVITE_DAYS;
    if (i >= 0) {
      days = Number(rest[i + 1]);
      rest.splice(i, 2);
      if (!Number.isInteger(days) || days < 1 || days > 90)
        throw new Error("--days must be 1 to 90");
    }
    const inv = await createInvite(pool, rest.join(" "), days);
    return `Invite link (one use, expires ${inv.expiresAt.toISOString().slice(0, 10)}):\n${publicUrl}/#/invite/${inv.token}`;
  }
  if (cmd === "reset-password") {
    const email = normalizeEmail(rest[0]);
    if (!email) throw new Error("usage: reset-password <email>");
    const password = randomPassword();
    if (!(await resetPassword(pool, email, password)))
      throw new Error("no account with that email");
    return `New password for ${email} (shown once; they can change it after signing in):\n${password}`;
  }
  if (cmd === "delete-user") {
    const email = normalizeEmail(rest[0]);
    if (!email) throw new Error("usage: delete-user <email>");
    if (!(await deleteUser(pool, email, modules))) throw new Error("no account with that email");
    return `Deleted ${email}.`;
  }
  if (cmd === "disable-user" || cmd === "enable-user") {
    const email = normalizeEmail(rest[0]);
    if (!email) throw new Error(`usage: ${cmd} <email>`);
    const disable = cmd === "disable-user";
    if (!(await setDisabled(pool, email, disable))) throw new Error("no account with that email");
    return disable
      ? `Disabled ${email}: it can't sign in and was signed out everywhere.`
      : `Enabled ${email}: it can sign in again.`;
  }
  if (cmd === "list-users") {
    const users = await listUsers(pool);
    const notes = new Map<string, string>();
    for (const m of modules)
      for (const [email, note] of (await m.userNotes?.(pool)) ?? [])
        notes.set(email, [notes.get(email), note].filter(Boolean).join("  "));
    return users.length
      ? users
          .map((u) => {
            const note = notes.get(u.email);
            return `${u.email}${u.disabled ? "  (disabled)" : ""}${note ? `  ${note}` : ""}  since ${u.createdAt.toISOString().slice(0, 10)}`;
          })
          .join("\n")
      : "No accounts yet.";
  }
  const added = cmd ? extra.get(cmd) : undefined;
  if (added) return added.run(rest, pool);
  return [USAGE, ...[...extra.values()].map((c) => `  ${c.usage}`)].join("\n");
}

// Only when run directly (tests import `run`).
if (process.argv[1]?.endsWith("admin.js") || process.argv[1]?.endsWith("admin.ts")) {
  const config = loadConfig(process.env, "admin");
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    await migrate(pool);
    const modules = await loadModules({ pool, env: process.env });
    process.stdout.write(
      `${await run(process.argv.slice(2), pool, config.publicUrl, modules, config.signIn)}\n`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : "failed");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
