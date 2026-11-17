// The AI module's seed: one status line saying whether this host offers the AI. Replace it with
// the app's first AI feature; keep every AI call behind getPlatform().sample().
import { getPlatform, type Platform } from "../platform";

export async function aiStatus(platform: Platform = getPlatform()): Promise<string> {
  if (!(await platform.sample())) return "The AI is not available here.";
  const state = await platform.permissionState("sample");
  // null: the host offers the AI but not to this visitor (not signed in); no limit is involved.
  if (state === null) return "The AI is not available to visitors who are not signed in.";
  // Ready only while the host would let a call through: not over the person's allowance and, on the
  // web, not past the site-wide cap. "denied" means it will refuse until the limit resets.
  if (state === "denied")
    return "The AI is unavailable right now: its usage limit is used up. It comes back when the limit resets.";
  return "The AI is ready.";
}

export async function mount(root: HTMLElement): Promise<void> {
  const line = document.createElement("p");
  line.id = "ai-status";
  line.setAttribute("role", "status");
  line.textContent = await aiStatus();
  root.append(line);
}
