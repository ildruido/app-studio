# app-studio: load the studio harness in every thread of a Claude Code Project (and in cloud sessions
# with several repos). Paste this whole file into the "app-studio apps" cloud environment's setup script.
# It runs as root before threads start and never fails a session. It installs only a fixed launcher and
# the hook wiring in the start folder's .claude/; on every session start and hook, the launcher runs the
# current scripts/studio-env.mjs from the app-studio checkout, so app-studio updates reach threads
# without pasting this again (the environment's setup may be cached from an older checkout).
# Log: /tmp/studio-env.log
cat > /tmp/studio-env-launch.mjs <<'EOF'
// Launcher for app-studio's scripts/studio-env.mjs (installed by the app-studio apps environment).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const isStudio = (d) => fs.existsSync(path.join(d, "plugins/studio/.claude-plugin/plugin.json"));
const kids = (d) => { try { return fs.readdirSync(d).sort().map((n) => path.join(d, n)); } catch { return []; } };
const args = process.argv.slice(2);
if (args[0] === "install") {
  // Setup time, as root: find the folder that holds the checkouts (here, or wherever app-studio is).
  let top = process.cwd();
  if (!kids(top).some(isStudio)) {
    const roots = (process.env.STUDIO_ENV_ROOTS || "/home /workspace").split(" "); // override: tests only
    const f = spawnSync("find", [...roots, "-maxdepth", "6", "-name", "plugin.json"], { encoding: "utf8" });
    const hit = (f.stdout || "").split("\n").find((p) => p.endsWith("/plugins/studio/.claude-plugin/plugin.json") && !p.includes("/.claude/"));
    if (hit) top = path.dirname(path.resolve(hit, "../../../.."));
  }
  if (!kids(top).some(isStudio)) { console.log(`[studio-env] app-studio not found near ${top}: nothing installed`); process.exit(0); }
  const dir = path.join(top, ".claude");
  fs.mkdirSync(dir, { recursive: true });
  const me = path.join(dir, "studio-env-launch.mjs");
  fs.copyFileSync(fileURLToPath(import.meta.url), me);
  const file = path.join(dir, "settings.json");
  let s = {};
  try { s = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  s.hooks ??= {};
  for (const e of Object.keys(s.hooks))
    s.hooks[e] = s.hooks[e].map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !String(h.command).includes("studio-env")) })).filter((g) => g.hooks.length);
  const run = (a) => `node "${me}" ${a}`;
  const add = (e, matcher, a, timeout) => (s.hooks[e] ??= []).push({ ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command: run(a), timeout }] });
  add("SessionStart", null, "session", 300);
  add("PreToolUse", "Bash", "hook commit", 60);
  add("PreToolUse", "mcp__.*github.*__merge_pull_request", "hook merge", 30);
  add("PreToolUse", "mcp__.*github.*__(push_files|create_or_update_file|delete_file)", "hook write", 30);
  add("PostToolUse", "Edit|Write|MultiEdit", "hook lint", 120);
  add("Stop", null, "hook test", 300);
  fs.writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`);
  console.log(`[studio-env] launcher and hooks installed in ${dir}`);
  spawnSync(process.execPath, [me, "link"], { stdio: "inherit" });
  const { uid, gid } = fs.statSync(top);
  if (process.getuid?.() === 0 && uid !== 0) spawnSync("chown", ["-R", `${uid}:${gid}`, dir]);
  process.exit(0);
}
// Session time: run the current studio-env.mjs from the app-studio checkout beside this folder.
const top = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const studio = kids(top).find(isStudio);
const script = studio && path.join(studio, "scripts/studio-env.mjs");
if (!script || !fs.existsSync(script)) {
  if (args[0] === "session") console.log("app-studio's scripts/studio-env.mjs wasn't found, so the studio harness isn't loaded: run node <app>/.claude/studio/studio-sync.mjs check in the app.");
  process.exit(0);
}
const r = spawnSync(process.execPath, [script, ...args, top], { stdio: "inherit" });
process.exit(r.status ?? 0);
EOF
node /tmp/studio-env-launch.mjs install > /tmp/studio-env.log 2>&1 || true
