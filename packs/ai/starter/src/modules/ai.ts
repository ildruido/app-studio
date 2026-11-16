// The AI module's seed: one status line saying whether this host offers the AI. Replace it with
// the app's first AI feature; keep every AI call behind getPlatform().sample().
import { getPlatform, type Platform } from "../platform";

export async function aiStatus(platform: Platform = getPlatform()): Promise<string> {
  return (await platform.sample()) ? "The AI is ready." : "The AI is not available here.";
}

export async function mount(root: HTMLElement): Promise<void> {
  const line = document.createElement("p");
  line.id = "ai-status";
  line.setAttribute("role", "status");
  line.textContent = await aiStatus();
  root.append(line);
}
