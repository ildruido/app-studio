// DOM-free helpers for the web AI (the ai-web module's /api/ai, `.claude/packs/ai-web/STACK.md`):
// reading the AI answer stream.

export type AiEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "done"; truncated: boolean; modelTierApplied: "quick" | "default" | "complex" }
  | { type: "error"; code: string; message: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates one decoded event; anything the page doesn't know is dropped. */
export function parseAiEvent(data: string): AiEvent | null {
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v.type) {
    case "text":
      return typeof v.delta === "string" ? { type: "text", delta: v.delta } : null;
    case "tool_call":
      return typeof v.id === "string" && typeof v.name === "string" && isObj(v.input)
        ? { type: "tool_call", id: v.id, name: v.name, input: v.input }
        : null;
    case "done":
      return {
        type: "done",
        truncated: v.truncated === true,
        modelTierApplied:
          v.modelTierApplied === "default" || v.modelTierApplied === "complex"
            ? v.modelTierApplied
            : "quick",
      };
    case "error":
      return {
        type: "error",
        code: typeof v.code === "string" ? v.code : "internal",
        message: typeof v.message === "string" ? v.message : "The AI could not answer.",
      };
    default:
      return null;
  }
}

/** Splits a server-sent-event byte stream into AI events. */
export async function* readAiEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AiEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buf = "";
  const parse = (block: string) => {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    return data ? parseAiEvent(data) : null;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const ev = parse(buf.slice(0, i));
        buf = buf.slice(i + 2);
        if (ev) yield ev;
      }
    }
    const last = parse(buf);
    if (last) yield last;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
