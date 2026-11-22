// Serves the built site (dist/) the way static hosting does: a folder's index.html, and 404.html with
// status 404 for anything missing. The browser tests use it because `astro preview` may start in the
// background (and exit) when it detects an automated session.
//   node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("dist");
const port = Number(process.argv[2] ?? 4321);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".xml": "application/xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function find(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/")).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  for (const candidate of [join(root, clean), join(root, clean, "index.html")]) {
    if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile())
      return candidate;
  }
  return null;
}

createServer((req, res) => {
  const file = find(req.url ?? "/");
  const status = file ? 200 : 404;
  const target = file ?? join(root, "404.html");
  const body = existsSync(target) ? readFileSync(target) : "Not found";
  res.writeHead(status, { "content-type": types[extname(target)] ?? "application/octet-stream" });
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log(`Serving dist/ at http://127.0.0.1:${port}`));
