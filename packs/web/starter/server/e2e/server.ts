// The server for the browser tests (e2e/web/): the real app and database, a scripted AI.
// Never part of the production image (the Dockerfile builds only src/), and it refuses to
// start when NODE_ENV=production.
//
// The AI answers from the last user message:
//   contains "TOOL"  -> asks for the page tool `echo` once, then repeats what the tool returned
//   contains "FAIL"  -> the AI service is down
//   a short message  -> "Fake coach: <the message>"
//   a long prompt    -> "A short plan: one small step first."
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import pg from "pg";
import { createInvite } from "../src/accounts.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/db.js";
import { UpstreamError, type CoachUpstream } from "../src/coach/upstream.js";
import { buildApp } from "../src/wire.js";

if (process.env.NODE_ENV === "production") throw new Error("the e2e server is for tests only");

export const SCHEMA = "e2e_web";

function lastText(params: Record<string, unknown>): { text: string; toolResult: string | null } {
  const messages = params.messages as { role: string; content: unknown }[];
  const last = messages[messages.length - 1];
  if (Array.isArray(last?.content)) {
    const r = last.content[0] as { content?: string };
    const first = messages.find((m) => typeof m.content === "string");
    return { text: String(first?.content ?? ""), toolResult: r.content ?? "" };
  }
  return { text: String(last?.content ?? ""), toolResult: null };
}

const upstream: CoachUpstream = async function* (params) {
  const { text, toolResult } = lastText(params);
  if (text.includes("FAIL")) throw new UpstreamError(500);
  yield { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } };
  if (text.includes("TOOL") && toolResult === null) {
    yield {
      type: "content_block_start",
      content_block: { type: "tool_use", id: "tu_1", name: "echo" },
    };
    yield {
      type: "content_block_delta",
      delta: { type: "input_json_delta", partial_json: '{"word":"hello"}' },
    };
    yield { type: "content_block_stop" };
  } else {
    const answer =
      toolResult !== null
        ? `Tool said ${toolResult}`
        : text.length > 200
          ? "A short plan: one small step first."
          : `Fake coach: ${text}`;
    yield { type: "content_block_start", content_block: { type: "text" } };
    for (const word of answer.split(/(?<= )/)) {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: word } };
    }
    yield { type: "content_block_stop" };
  }
  yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } };
  yield { type: "message_stop" };
};

const url = process.env.DATABASE_URL ?? "postgres://postgres:test@localhost:5432/postgres";
const port = Number(process.env.PORT ?? 4175);

const admin = new pg.Pool({ connectionString: url });
await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
await admin.query(`CREATE SCHEMA ${SCHEMA}`);
await admin.end();
const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${SCHEMA}` });
await migrate(pool);

const config = loadConfig(
  {
    DATABASE_URL: url,
    PORT: String(port),
    COOKIE_SECURE: "0",
    PUBLIC_URL: `http://localhost:${port}`,
  },
  "e2e",
);
const real = buildApp(pool, config, upstream, process.env.WEB_DIR ?? "../dist-web");
// Tests ask for invites here (the admin command's job in real life). Not in the real server.
const app = new Hono();
app.post("/__e2e/invite", async (c) => c.json({ token: (await createInvite(pool, "e2e")).token }));
app.route("/", real);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) =>
  console.warn(`e2e server on ${info.port}`),
);
