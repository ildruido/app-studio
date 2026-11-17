// The ai-web module's part of the web platform: getPlatform().sample() over /api/ai and the AI's
// consent state from /api/ai/usage (`.claude/packs/ai-web/STACK.md`). The web adapter picks it up
// from this folder; nothing else changes.

import { readAiEvents } from "../ai-sse";
import type { WebProvider } from "../web";
import { errorFromResponse, networkError, request, type Fetch } from "../web-http";

const json = { "content-type": "application/json" };
/** The server rebuilds only the latest tool turn: one tool round, then the answer. */
const MAX_TURNS = 2;

const SAMPLE_STATUS = {
  401: "not_granted",
  403: "capability_disabled",
  413: "prompt_too_large",
  429: "rate_limited",
  503: "capability_removed",
};

export function webSample(fetchImpl: Fetch = fetch): SampleFn {
  const sample = (async (input, options = {}) => {
    const { onText, signal, tools } = options;
    const tier = options.modelTier === "quick" ? "quick" : "default";
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    const specs = tools?.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    }));
    let toolResults:
      { id: string; name: string; input: Record<string, unknown>; output: unknown }[] | undefined;
    let text = "";
    const fail = (e: { code: string; message: string }): SampleError => ({
      code: e.code,
      message: e.message,
      ...(text && { text }),
    });

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let res: Response;
      try {
        res = await request(fetchImpl, "/api/ai", {
          method: "POST",
          headers: json,
          signal,
          body: JSON.stringify({
            messages,
            modelTier: tier,
            ...(specs?.length && { tools: specs }),
            toolResults,
          }),
        });
      } catch (err) {
        if (signal?.aborted) throw { code: "aborted", message: "The request was cancelled." };
        throw fail(err as { code: string; message: string });
      }
      if (!res.ok || !res.body) throw fail(await errorFromResponse(res, SAMPLE_STATUS));

      let call: { id: string; name: string; input: Record<string, unknown> } | null = null;
      let done: { truncated: boolean; modelTierApplied: "quick" | "default" | "complex" } | null =
        null;
      try {
        for await (const ev of readAiEvents(res.body)) {
          if (ev.type === "text") {
            text += ev.delta;
            onText?.({ text, delta: ev.delta });
          } else if (ev.type === "tool_call") call = ev;
          else if (ev.type === "done") done = ev;
          else throw fail(ev);
        }
      } catch (err) {
        if (signal?.aborted) throw { code: "aborted", message: "The request was cancelled." };
        if ((err as { code?: string })?.code) throw err;
        throw fail(networkError());
      }

      if (!call) {
        if (!text.trim())
          throw { code: "empty_completion", message: "The AI sent an empty answer." };
        // A stream cut off before its closing event is an incomplete answer.
        if (!done) throw fail({ code: "resource_exhausted", message: "The answer stopped early." });
        return {
          text,
          truncated: done.truncated,
          modelTierApplied: done.modelTierApplied,
        };
      }
      // A tool lives in the page: run it here and send its output back.
      const tool = tools?.find((t) => t.name === call.name);
      let output: unknown;
      try {
        if (signal?.aborted) throw { code: "aborted", message: "The request was cancelled." };
        output = tool
          ? await tool.execute(call.input, { signal: signal ?? new AbortController().signal })
          : { error: "unknown tool" };
      } catch (err) {
        if (signal?.aborted) throw { code: "aborted", message: "The request was cancelled." };
        output = { error: err instanceof Error ? err.message : "the tool failed" };
      }
      toolResults = [{ id: call.id, name: call.name, input: call.input, output }];
    }
    throw fail({ code: "resource_exhausted", message: "The AI asked for too many tools." });
  }) as SampleFn;

  sample.limits = async () => {
    const res = await request(fetchImpl, "/api/ai/limits");
    if (!res.ok) throw await errorFromResponse(res, SAMPLE_STATUS);
    return (await res.json()) as SampleLimits;
  };
  return sample;
}

/** The AI is usable when the person is under their allowance and the site's cap is not reached. */
export async function webAiPermission(fetchImpl: Fetch = fetch): Promise<PermissionState> {
  try {
    const res = await request(fetchImpl, "/api/ai/usage");
    if (!res.ok) return "denied";
    const u = (await res.json()) as {
      usedTokens: number;
      allowanceTokens: number;
      capReached?: boolean;
    };
    if (u.capReached) return "denied";
    return u.allowanceTokens > 0 && u.usedTokens < u.allowanceTokens ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

const provider: WebProvider = (fetchImpl) => {
  const sample = webSample(fetchImpl);
  return {
    sample: async () => sample,
    permissionState: async (name) => (name === "sample" ? webAiPermission(fetchImpl) : null),
  };
};
export default provider;
