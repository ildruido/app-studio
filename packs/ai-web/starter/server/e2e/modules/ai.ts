// The scripted AI for the browser tests: replaces Anthropic in the e2e server (../server.ts).
// Never part of the production image (the Dockerfile builds only src/).
// The AI answers from the last user message:
//   contains "TOOL"  -> asks for the page tool `echo` once, then repeats what the tool returned
//   contains "FAIL"  -> the AI service is down
//   a short message  -> "Fake AI: <the message>"
//   a long prompt    -> "A short plan: one small step first."
import { UpstreamError, type AiUpstream } from "../../src/ai/upstream.js";

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

const upstream: AiUpstream = async function* (params) {
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
          : `Fake AI: ${text}`;
    yield { type: "content_block_start", content_block: { type: "text" } };
    for (const word of answer.split(/(?<= )/)) {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: word } };
    }
    yield { type: "content_block_stop" };
  }
  yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } };
  yield { type: "message_stop" };
};

export default { upstream };
