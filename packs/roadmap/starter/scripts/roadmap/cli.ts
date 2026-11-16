// npm run roadmap:check  -> exits 1 when an open backlog item is missing from the Roadmap list.
// npm run roadmap:data   -> prints the roadmap page data (JSON) rebuilt from docs/BACKLOG.md.
import { existsSync, readFileSync } from "node:fs";
import { checkRoadmap, roadmapBoard } from "./roadmap";

const file = new URL("../../docs/BACKLOG.md", import.meta.url);
const cmd = process.argv[2];

// A fresh app has no backlog yet: say so plainly instead of crashing on the missing file.
if ((cmd === "check" || cmd === "data") && !existsSync(file)) {
  if (cmd === "check") {
    process.stdout.write("No docs/BACKLOG.md yet, so there is no Roadmap list to check.\n");
    process.exit(0);
  }
  console.error("No docs/BACKLOG.md yet: add the backlog first, then run roadmap:data again.");
  process.exit(1);
}
const md = existsSync(file) ? readFileSync(file, "utf8") : "";

if (cmd === "check") {
  const problems = checkRoadmap(md);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  process.stdout.write("Roadmap list matches the open backlog items." + "\n");
} else if (cmd === "data") {
  const source = process.argv[3] ?? "rebuilt from docs/BACKLOG.md";
  process.stdout.write(JSON.stringify(roadmapBoard(md, source)) + "\n");
} else {
  console.error("usage: cli.ts check | data [source label]");
  process.exit(2);
}
