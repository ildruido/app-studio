import { describe, expect, it } from "vitest";
import { monthStart, resetsAt } from "../src/coach/ledger.js";
import {
  PromptTooLarge,
  RequestError,
  StreamMapper,
  ToolsUnavailable,
  mapUpstreamError,
  parseRequest,
  toUpstream,
} from "../src/coach/mapping.js";
import { sseEvents } from "../src/coach/upstream.js";

const models = { quick: "haiku-x", default: "sonnet-x" };
const tool = { name: "lookup", description: "d", inputSchema: { type: "object" } };

describe("parseRequest", () => {
  it("wraps a string and maps tiers", () => {
    const r = parseRequest({ messages: "hi", modelTier: "quick" });
    expect(r.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(toUpstream(r, models).model).toBe("haiku-x");
    expect(toUpstream(parseRequest({ messages: "hi", modelTier: "complex" }), models).model).toBe(
      "sonnet-x",
    );
    expect(toUpstream(parseRequest({ messages: "hi" }), models).model).toBe("sonnet-x");
  });
  it("clamps output tokens", () => {
    expect(parseRequest({ messages: "a", maxOutputTokens: 99999 }).maxOutputTokens).toBe(4096);
    expect(parseRequest({ messages: "a", maxOutputTokens: 0 }).maxOutputTokens).toBe(1);
  });
  it("rejects bad input", () => {
    expect(() => parseRequest(null)).toThrow(RequestError);
    expect(() => parseRequest({ messages: [{ role: "system", content: "x" }] })).toThrow(
      RequestError,
    );
    expect(() => parseRequest({ messages: "a", modelTier: "huge" })).toThrow(RequestError);
    expect(() => parseRequest({ messages: "x".repeat(40_000) })).toThrow(PromptTooLarge);
    expect(() => parseRequest({ messages: "a", tools: Array(9).fill(tool) })).toThrow(
      ToolsUnavailable,
    );
  });
  it("only accepts tool results for declared tools", () => {
    const base = { messages: "a", tools: [tool] };
    const res = { id: "t1", name: "other", input: {}, output: 1 };
    expect(() => parseRequest({ ...base, toolResults: [res] })).toThrow(RequestError);
  });
});

describe("toUpstream", () => {
  it("rebuilds the tool turn in order", () => {
    const r = parseRequest({
      messages: [{ role: "user", content: "q" }],
      tools: [tool],
      toolResults: [{ id: "t1", name: "lookup", input: { q: "f" }, output: { best: "answer" } }],
    });
    const p = toUpstream(r, models) as {
      messages: { role: string; content: unknown }[];
      tool_choice: unknown;
    };
    expect(p.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(p.messages[1]?.content).toEqual([
      { type: "tool_use", id: "t1", name: "lookup", input: { q: "f" } },
    ]);
    expect(p.messages[2]?.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: '{"best":"answer"}' },
    ]);
    expect(p.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
  });
});

describe("StreamMapper", () => {
  const run = (evs: Record<string, unknown>[], tier: "quick" | "default" = "quick") => {
    const m = new StreamMapper(tier);
    return { m, out: evs.flatMap((e) => m.push(e)) };
  };
  it("streams text, counts tokens and flags truncation", () => {
    const { m, out } = run([
      {
        type: "message_start",
        message: { usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 1 } },
      },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
      { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 7 } },
      { type: "message_stop" },
    ]);
    expect(out).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
    ]);
    expect(m.tokens).toBe(22);
    expect(m.finish(false)).toEqual({ type: "done", truncated: true, modelTierApplied: "quick" });
  });
  it("assembles a tool call from json chunks", () => {
    const { out } = run([
      {
        type: "content_block_start",
        content_block: { type: "tool_use", id: "t9", name: "lookup" },
      },
      { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"q":' } },
      { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '"x"}' } },
      { type: "content_block_stop" },
    ]);
    expect(out).toEqual([{ type: "tool_call", id: "t9", name: "lookup", input: { q: "x" } }]);
  });
  it("reports empty and refused answers", () => {
    expect(run([{ type: "message_stop" }]).m.finish(false)).toMatchObject({
      code: "empty_completion",
    });
    expect(run([]).m.finish(false)).toMatchObject({ code: "resource_exhausted" });
    const { m } = run([
      { type: "content_block_delta", delta: { type: "text_delta", text: "x" } },
      { type: "message_delta", delta: { stop_reason: "refusal" } },
      { type: "message_stop" },
    ]);
    expect(m.finish(false)).toMatchObject({ code: "refused" });
  });
});

describe("errors and months", () => {
  it("maps upstream statuses", () => {
    expect(mapUpstreamError(401).code).toBe("capability_removed");
    expect(mapUpstreamError(400).code).toBe("invalid_request");
    expect(mapUpstreamError(429).code).toBe("resource_exhausted");
    expect(mapUpstreamError(0).code).toBe("resource_exhausted");
  });
  it("uses UTC months", () => {
    const d = new Date("2026-12-31T23:59:59Z");
    expect(monthStart(d)).toBe("2026-12-01");
    expect(resetsAt(d)).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("sseEvents", () => {
  it("parses events split across chunks", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(enc.encode('event: a\ndata: {"type":"x"}\n\ndata: {"ty'));
        ctl.enqueue(enc.encode('pe":"y"}\r\n\r\n'));
        ctl.close();
      },
    });
    const got: unknown[] = [];
    for await (const e of sseEvents(body)) got.push(e);
    expect(got).toEqual([{ type: "x" }, { type: "y" }]);
  });
});
