# app-studio: load the studio harness in every thread of a Claude Code Project (and in cloud sessions
# with several repos). Paste this whole file into the cloud environment's setup script. It runs as root
# before each thread starts, after the repos are cloned, and never fails the session.
# Log: /tmp/studio-env.log
cat > /tmp/studio-env.mjs <<'EOF'
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const log = (m) => console.log(`[studio-env] ${m}`);
const has = (d, f) => fs.existsSync(path.join(d, f));
const isStudio = (d) => has(d, "plugins/studio/.claude-plugin/plugin.json");
const isApp = (d) => has(d, ".claude/studio/lock.json");
const kids = (d) => {
  try {
    return fs.readdirSync(d).map((n) => path.join(d, n)).filter((p) => fs.statSync(p).isDirectory());
  } catch {
    return [];
  }
};
// The folder that holds the checkouts (the thread's start folder): here, or wherever app-studio is.
let top = process.argv[2] || process.cwd();
if (!kids(top).some((d) => isStudio(d) || isApp(d))) {
  const roots = (process.env.STUDIO_ENV_ROOTS || "/home /workspace").split(" ");
  const f = spawnSync("find", [...roots, "-maxdepth", "6", "-name", "plugin.json"], { encoding: "utf8" });
  const hit = (f.stdout || "").split("\n").find((p) => p.endsWith("/plugins/studio/.claude-plugin/plugin.json") && !p.includes("/.claude/"));
  if (hit) top = path.dirname(path.resolve(hit, "../../../.."));
}
const studio = kids(top).find(isStudio);
const app = kids(top).find(isApp);
if (!studio && !app) {
  log(`no app-studio or studio app under ${top}: nothing to do`);
  process.exit(0);
}
const dst = path.join(top, ".claude");
const src = app ? path.join(app, ".claude") : path.join(studio, "plugins/studio");
// 1. Skills and agents where the thread looks for them: the start folder's .claude/.
for (const k of ["skills", "agents"])
  if (has(src, k)) fs.cpSync(path.join(src, k), path.join(dst, k), { recursive: true, force: true });
// 2. Hooks: the app's own, with paths made absolute; SessionStart says which repo is the app.
const file = path.join(dst, "settings.json");
let s = {};
try {
  s = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {}
s.hooks ??= {};
const ours = (c) => String(c).includes("studio-env") || (app && String(c).includes(`${app}/.claude/`));
for (const e of Object.keys(s.hooks))
  s.hooks[e] = s.hooks[e].map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !ours(h.command)) })).filter((g) => g.hooks.length);
const say = app
  ? `Studio harness loaded for the app repo ${path.basename(app)} (${app}). Work on the app inside that folder.`
  : "Studio harness loaded from app-studio, no app set up yet: use the new-app skill to start one.";
const add = (e, g) => (s.hooks[e] ??= []).push(g);
add("SessionStart", { hooks: [{ type: "command", command: `echo ${JSON.stringify(say)} # studio-env` }] });
if (app) {
  let own = {};
  try {
    own = JSON.parse(fs.readFileSync(path.join(app, ".claude/settings.json"), "utf8")).hooks ?? {};
  } catch {}
  for (const [e, groups] of Object.entries(own))
    for (const g of groups) {
      const hooks = (g.hooks ?? [])
        .filter((h) => !String(h.command).includes("cloud-setup.mjs"))
        .map((h) => ({ ...h, command: String(h.command).replace(/(^|\s)\.claude\//g, `$1${app}/.claude/`) }));
      if (hooks.length) add(e, { ...g, hooks });
    }
}
// 3. Playwright's browser for the app's e2e tests.
const pw = "/opt/pw-browsers";
const chrome = kids(pw)
  .filter((d) => /\/chromium-\d+$/.test(d))
  .flatMap((d) => ["chrome-linux64", "chrome-linux"].map((o) => path.join(d, o, "chrome")))
  .find((p) => fs.existsSync(p));
if (chrome) s.env = { ...s.env, PW_CHROMIUM: chrome };
fs.mkdirSync(dst, { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`);
log(`${app ? `app ${app}` : `bootstrap from ${studio}`}: skills, agents and hooks in ${dst}`);
// 4. The app's dependencies, its own setup, and the git pre-commit health check.
if (app) {
  const run = (cmd, args, cwd = app) => {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
    log(`${cmd} ${args.join(" ")}: ${r.status === 0 ? "ok" : `failed\n${(r.stderr || "").slice(-400)}`}`);
  };
  if (has(app, "package-lock.json")) run("npm", ["ci", "--no-audit", "--no-fund"]);
  if (has(app, "server/package-lock.json")) run("npm", ["ci", "--no-audit", "--no-fund"], path.join(app, "server"));
  if (has(app, "scripts/cloud-setup.sh")) run("bash", ["scripts/cloud-setup.sh"]);
  // Root may not own the checkout, so tell git to trust it for these two calls.
  const git = ["-c", "safe.directory=*", "-C", app, "config"];
  const cur = spawnSync("git", [...git, "--get", "core.hooksPath"], { encoding: "utf8" });
  if (!(cur.stdout || "").trim() && has(app, ".claude/hooks/pre-commit")) run("git", [...git, "core.hooksPath", ".claude/hooks"]);
}
// 5. Root wrote these files: give them to whoever owns the start folder (the thread's user).
const { uid, gid } = fs.statSync(top);
if (process.getuid?.() === 0 && uid !== 0)
  for (const p of [dst, app].filter(Boolean)) spawnSync("chown", ["-R", `${uid}:${gid}`, p]);
EOF
node /tmp/studio-env.mjs > /tmp/studio-env.log 2>&1 || true
