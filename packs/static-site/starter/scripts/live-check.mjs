// Checks that an address serves THIS site, not someone else's (a pages.dev name can belong to another
// company). Fetches <address>/en/ and compares its <title> with the one in the built dist/en/index.html.
//   node scripts/live-check.mjs <address> [--public]
// --public also fails when the page carries the previews' "noindex" header (the live site must not).
// Retries for about a minute, because a new deploy takes a moment to appear.
import { readFileSync } from "node:fs";

const [address, ...flags] = process.argv.slice(2);
if (!address) {
  console.error("Usage: node scripts/live-check.mjs <address> [--public]");
  process.exit(2);
}
const attempts = Number(process.env.LIVE_CHECK_ATTEMPTS ?? 8);
const delayMs = Number(process.env.LIVE_CHECK_DELAY_MS ?? 8000);
const titleOf = (html) => /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";

const expected = titleOf(readFileSync("dist/en/index.html", "utf8"));
if (!expected) {
  console.error("The built page dist/en/index.html has no <title>.");
  process.exit(2);
}
const url = `${address.replace(/\/+$/, "")}/en/`;
let problem = "";
for (let i = 1; i <= attempts; i++) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const found = titleOf(await res.text());
    const noindex = /noindex/i.test(res.headers.get("x-robots-tag") ?? "");
    if (res.status !== 200) problem = `${url} answered ${res.status}.`;
    else if (found !== expected)
      problem = `${url} shows "${found}", not this site ("${expected}"): the address may belong to someone else.`;
    else if (flags.includes("--public") && noindex)
      problem = `${url} sends a "noindex" header: search engines would skip the live site.`;
    else {
      console.log(`OK: ${url} is this site ("${expected}").`);
      process.exit(0);
    }
  } catch (e) {
    problem = `${url} could not be reached (${e.message}).`;
  }
  console.log(`Attempt ${i}/${attempts}: ${problem}`);
  if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
}
console.error(`FAILED: ${problem}`);
process.exit(1);
