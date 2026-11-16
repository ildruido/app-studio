import { describe, expect, it } from "vitest";
import { parseAiEvent } from "../../src/platform/ai-sse";
import { createWebPlatform } from "../../src/platform/web";
import { webSample } from "../../src/platform/web-providers/ai";

const sse = (...events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("AI events", () => {
  it("accepts known events only", () => {
    expect(parseAiEvent('{"type":"text","delta":"hi"}')).toEqual({ type: "text", delta: "hi" });
    expect(parseAiEvent('{"type":"text"}')).toBeNull();
    expect(parseAiEvent("nope")).toBeNull();
    expect(parseAiEvent('{"type":"mystery"}')).toBeNull();
  });
});

describe("web sample", () => {
  it("streams text and reports the final answer", async () => {
    const seen: string[] = [];
    const f = (async () =>
      sse(
        { type: "text", delta: "Take " },
        { type: "text", delta: "space." },
        { type: "done", truncated: false, modelTierApplied: "quick" },
      )) as unknown as typeof fetch;
    const result = await webSample(f)("hi", {
      modelTier: "quick",
      onText: (u) => seen.push(u.text),
    });
    expect(result).toEqual({ text: "Take space.", truncated: false, modelTierApplied: "quick" });
    expect(seen).toEqual(["Take ", "Take space."]);
  });

  it("runs a page tool and sends its output back, echoing the call", async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      bodies.push(body);
      return bodies.length === 1
        ? sse({ type: "tool_call", id: "t1", name: "echo", input: { word: "hello" } })
        : sse(
            { type: "text", delta: "ok" },
            { type: "done", truncated: false, modelTierApplied: "default" },
          );
    }) as unknown as typeof fetch;
    const tool: SampleTool = {
      name: "echo",
      description: "d",
      execute: (input) => String(input.word).toUpperCase(),
    };
    const result = await webSample(f)("go", { modelTier: "default", tools: [tool] });
    expect(result.text).toBe("ok");
    expect(bodies[0]).toMatchObject({ modelTier: "default", tools: [{ name: "echo" }] });
    expect(bodies[1]?.toolResults).toEqual([
      { id: "t1", name: "echo", input: { word: "hello" }, output: "HELLO" },
    ]);
  });

  it("does not run a tool for a cancelled request", async () => {
    const ctl = new AbortController();
    let ran = false;
    const f = (async () => {
      ctl.abort();
      return sse({ type: "tool_call", id: "t1", name: "echo", input: {} });
    }) as unknown as typeof fetch;
    const tool: SampleTool = {
      name: "echo",
      description: "d",
      execute: () => {
        ran = true;
        return "x";
      },
    };
    await expect(webSample(f)("go", { signal: ctl.signal, tools: [tool] })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(ran).toBe(false);
  });

  it("stops a tool loop that never ends", async () => {
    const f = (async () =>
      sse({ type: "tool_call", id: "t", name: "echo", input: {} })) as unknown as typeof fetch;
    const tool: SampleTool = { name: "echo", description: "d", execute: () => "x" };
    await expect(webSample(f)("go", { tools: [tool] })).rejects.toMatchObject({
      code: "resource_exhausted",
    });
  });

  it("rejects with plain objects carrying the page's codes, and keeps partial text", async () => {
    const stream = (async () =>
      sse(
        { type: "text", delta: "Partial" },
        { type: "error", code: "resource_exhausted", message: "busy" },
      )) as unknown as typeof fetch;
    await expect(webSample(stream)("hi")).rejects.toEqual({
      code: "resource_exhausted",
      message: "busy",
      text: "Partial",
    });
    const limited = (async () =>
      jsonRes(
        { error: { code: "rate_limited", message: "used up" } },
        429,
      )) as unknown as typeof fetch;
    await expect(webSample(limited)("hi")).rejects.toMatchObject({ code: "rate_limited" });
    const empty = (async () =>
      sse({
        type: "done",
        truncated: false,
        modelTierApplied: "quick",
      })) as unknown as typeof fetch;
    await expect(webSample(empty)("hi")).rejects.toMatchObject({ code: "empty_completion" });
    const cut = (async () => sse({ type: "text", delta: "Half an" })) as unknown as typeof fetch;
    await expect(webSample(cut)("hi")).rejects.toMatchObject({
      code: "resource_exhausted",
      text: "Half an",
    });
    const offline = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    await expect(webSample(offline)("hi")).rejects.toMatchObject({ code: "resource_exhausted" });
  });
});

describe("web platform with the AI", () => {
  it("serves sample and says whether the AI is usable", async () => {
    let signedIn = true;
    const f = (async () =>
      signedIn
        ? jsonRes({ usedTokens: 10, allowanceTokens: 100, resetsAt: "x" })
        : jsonRes({ error: { code: "unauthenticated" } }, 401)) as unknown as typeof fetch;
    const p = createWebPlatform(f);
    expect(typeof (await p.sample())).toBe("function");
    expect(await p.permissionState("sample")).toBe("granted");
    expect(await p.permissionState("db")).toBeNull();
    signedIn = false;
    expect(await p.permissionState("sample")).toBe("denied");
  });
});
