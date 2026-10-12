// Pure translation between the page's coach contract (docs/API.md) and the Anthropic Messages API.

export interface ModelIds {
  quick: string;
  default: string;
}

export const MAX_TOOLS = 8;
export const MAX_PROMPT_BYTES = 32 * 1024;
export const DEFAULT_OUTPUT_TOKENS = 1024;
export const MAX_OUTPUT_TOKENS = 4096;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface ToolResult {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: unknown;
}
export interface CoachRequest {
  messages: ChatMessage[];
  tier: "quick" | "default";
  maxOutputTokens: number;
  tools: ToolSpec[];
  toolResults: ToolResult[];
}

export class RequestError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function parseRequest(body: unknown): CoachRequest {
  if (!isObj(body)) throw new RequestError("body must be an object");
  const { messages, modelTier, maxOutputTokens, tools, toolResults } = body;

  let msgs: ChatMessage[];
  if (typeof messages === "string") msgs = [{ role: "user", content: messages }];
  else if (Array.isArray(messages) && messages.length > 0 && messages.length <= 200) {
    msgs = messages.map((m) => {
      if (
        !isObj(m) ||
        (m.role !== "user" && m.role !== "assistant") ||
        typeof m.content !== "string"
      )
        throw new RequestError("bad message");
      return { role: m.role, content: m.content };
    });
  } else throw new RequestError("messages must be a string or a non-empty list");
  if (msgs.some((m) => m.content.length === 0)) throw new RequestError("empty message");
  const bytes = msgs.reduce((n, m) => n + Buffer.byteLength(m.content), 0);
  if (bytes > MAX_PROMPT_BYTES) throw new PromptTooLarge();

  if (modelTier !== undefined && !["quick", "default", "complex"].includes(modelTier as string))
    throw new RequestError("bad modelTier");

  let max = DEFAULT_OUTPUT_TOKENS;
  if (maxOutputTokens !== undefined) {
    if (typeof maxOutputTokens !== "number" || !Number.isFinite(maxOutputTokens))
      throw new RequestError("bad maxOutputTokens");
    max = Math.min(MAX_OUTPUT_TOKENS, Math.max(1, Math.floor(maxOutputTokens)));
  }

  const toolList: ToolSpec[] = [];
  if (tools !== undefined) {
    if (!Array.isArray(tools) || tools.length > MAX_TOOLS) throw new ToolsUnavailable();
    for (const t of tools) {
      if (!isObj(t) || typeof t.name !== "string" || !/^[\w-]{1,64}$/.test(t.name))
        throw new RequestError("bad tool");
      if (typeof t.description !== "string" || t.description.length > 2000)
        throw new RequestError("bad tool");
      if (t.inputSchema !== undefined && !isObj(t.inputSchema)) throw new RequestError("bad tool");
      toolList.push({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema as Record<string, unknown> | undefined) ?? { type: "object" },
      });
    }
  }

  const results: ToolResult[] = [];
  if (toolResults !== undefined) {
    if (!Array.isArray(toolResults) || toolResults.length === 0 || toolResults.length > MAX_TOOLS)
      throw new RequestError("bad toolResults");
    for (const r of toolResults) {
      if (
        !isObj(r) ||
        typeof r.id !== "string" ||
        !/^[\w-]{1,64}$/.test(r.id) ||
        typeof r.name !== "string" ||
        !toolList.some((t) => t.name === r.name) ||
        !isObj(r.input)
      )
        throw new RequestError("bad toolResult");
      results.push({ id: r.id, name: r.name, input: r.input, output: r.output });
    }
    if (msgs[msgs.length - 1]?.role !== "user")
      throw new RequestError("toolResults need a user turn");
  }
  const outBytes = results.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r)), 0);
  if (bytes + outBytes > MAX_PROMPT_BYTES * 2) throw new PromptTooLarge();

  return {
    messages: msgs,
    tier: modelTier === "quick" ? "quick" : "default",
    maxOutputTokens: max,
    tools: toolList,
    toolResults: results,
  };
}

export class PromptTooLarge extends Error {}
export class ToolsUnavailable extends Error {}

type Block = Record<string, unknown>;

/** Builds the Messages API parameters. The server keeps no state, so a tool turn is rebuilt from the echo. */
export function toUpstream(req: CoachRequest, models: ModelIds): Record<string, unknown> {
  const messages: { role: string; content: string | Block[] }[] = [...req.messages];
  if (req.toolResults.length) {
    messages.push({
      role: "assistant",
      content: req.toolResults.map((r) => ({
        type: "tool_use",
        id: r.id,
        name: r.name,
        input: r.input,
      })),
    });
    messages.push({
      role: "user",
      content: req.toolResults.map((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: typeof r.output === "string" ? r.output : JSON.stringify(r.output ?? null),
      })),
    });
  }
  const params: Record<string, unknown> = {
    model: req.tier === "quick" ? models.quick : models.default,
    max_tokens: req.maxOutputTokens,
    messages,
    stream: true,
  };
  if (req.tools.length) {
    params.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
    params.tool_choice = { type: "auto", disable_parallel_tool_use: true };
  }
  return params;
}

export type CoachEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "done"; truncated: boolean; modelTierApplied: "quick" | "default" }
  | { type: "error"; code: string; message: string };

/** Upstream HTTP status (0 = network failure) to the page's error codes. */
export function mapUpstreamError(status: number): { code: string; message: string } {
  if (status === 401 || status === 403)
    return { code: "capability_removed", message: "the coach is not set up on the server" };
  if (status === 400 || status === 413 || status === 422)
    return { code: "invalid_request", message: "the coach could not take that request" };
  return { code: "resource_exhausted", message: "the coach is busy, try again later" };
}

/** Folds Anthropic stream events into page events and token usage. */
export class StreamMapper {
  inputTokens = 0;
  outputTokens = 0;
  private stop: string | null = null;
  private tool: { id: string; name: string; json: string } | null = null;
  private sawText = false;
  private sawStop = false;
  private textChars = 0;

  constructor(private readonly tier: "quick" | "default") {}

  /** Input plus output; a cut-off stream never reports its final count, so estimate from the text. */
  get tokens(): number {
    return this.inputTokens + Math.max(this.outputTokens, Math.ceil(this.textChars / 4));
  }

  /** Feeds one decoded Anthropic event; returns page events to send now. */
  push(ev: Record<string, unknown>): CoachEvent[] {
    const out: CoachEvent[] = [];
    switch (ev.type) {
      case "message_start": {
        const u = (ev.message as { usage?: Record<string, number> } | undefined)?.usage;
        if (u)
          this.inputTokens =
            (u.input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0);
        this.outputTokens = u?.output_tokens ?? 0;
        break;
      }
      case "content_block_start": {
        const b = ev.content_block as { type?: string; id?: string; name?: string } | undefined;
        if (b?.type === "tool_use") this.tool = { id: b.id ?? "", name: b.name ?? "", json: "" };
        break;
      }
      case "content_block_delta": {
        const d = ev.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        if (d?.type === "text_delta" && d.text) {
          this.sawText = true;
          this.textChars += d.text.length;
          out.push({ type: "text", delta: d.text });
        } else if (d?.type === "input_json_delta" && this.tool)
          this.tool.json += d.partial_json ?? "";
        break;
      }
      case "content_block_stop": {
        if (this.tool) {
          let input: Record<string, unknown> = {};
          try {
            const parsed: unknown = this.tool.json ? JSON.parse(this.tool.json) : {};
            if (isObj(parsed)) input = parsed;
          } catch {
            /* a malformed tool input becomes an empty one; the page validates it */
          }
          out.push({ type: "tool_call", id: this.tool.id, name: this.tool.name, input });
          this.tool = null;
        }
        break;
      }
      case "message_delta": {
        const d = ev.delta as { stop_reason?: string } | undefined;
        if (d?.stop_reason) this.stop = d.stop_reason;
        const u = ev.usage as Record<string, number> | undefined;
        if (u?.output_tokens !== undefined) this.outputTokens = u.output_tokens;
        break;
      }
      case "message_stop":
        this.sawStop = true;
        break;
      case "error":
        out.push({
          type: "error",
          code: "resource_exhausted",
          message: "the coach is busy, try again later",
        });
        break;
    }
    return out;
  }

  /** The closing event, or an error when the model said nothing at all. */
  finish(sentToolCall: boolean): CoachEvent {
    if (!this.sawStop)
      return {
        type: "error",
        code: "resource_exhausted",
        message: "the coach stopped early, try again",
      };
    if (!sentToolCall && !this.sawText)
      return { type: "error", code: "empty_completion", message: "the coach returned nothing" };
    if (this.stop === "refusal")
      return { type: "error", code: "refused", message: "the coach declined to answer" };
    return { type: "done", truncated: this.stop === "max_tokens", modelTierApplied: this.tier };
  }
}
