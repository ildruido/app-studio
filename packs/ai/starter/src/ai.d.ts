// The AI's shapes (the `ai` module). The Claude artifact runtime's `sample` capability has them as
// they are; the web build (`ai-web` module) returns the same shapes over /api/ai.

interface SampleTextUpdate {
  text: string;
  delta: string;
}

interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown;
}

interface SampleOptions {
  onText?: (update: SampleTextUpdate) => void;
  signal?: AbortSignal;
  modelTier?: "quick" | "default" | "complex";
  cache?: boolean | { gcTime?: number; refresh?: boolean };
  /** Page functions the AI may call; only where limits() reports `tools`. */
  tools?: SampleTool[];
}

interface SampleLimits {
  maxPromptBytes: number;
  tools?: { maxCount: number };
}

interface SampleResult {
  text: string;
  truncated: boolean;
  modelTierApplied: "quick" | "default" | "complex";
}

/** What a rejected sample() call carries. A plain object, not an Error. */
interface SampleError {
  code: string;
  message: string;
  text?: string;
}

type SampleFn = ((
  input: string | { role: "user" | "assistant"; content: string }[],
  options?: SampleOptions,
) => Promise<SampleResult>) & {
  /** Local and free; rejects on older runtimes. */
  limits?: () => Promise<SampleLimits>;
};

type PermissionState = "granted" | "prompt" | "denied" | "unavailable";

interface PermissionsApi {
  /** Reads a capability's consent state without prompting. */
  state(name: string): Promise<PermissionState>;
}

interface ClaudeRuntime {
  use(name: "sample"): Promise<SampleFn | null>;
  use(name: "permissions"): Promise<PermissionsApi | null>;
}
