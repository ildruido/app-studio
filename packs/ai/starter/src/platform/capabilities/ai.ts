// The ai module's part of the platform: getPlatform().sample() and permissionState(). Without
// this module they don't exist, so code that calls the AI doesn't compile. On the web the
// `ai-web` module serves them (src/platform/web-providers/ai.ts); elsewhere they resolve null.
import type { Capability } from "../types";

declare module "../types" {
  interface Platform {
    /** Ask the AI. Same shape as the artifact `sample` capability. */
    sample(): Promise<SampleFn | null>;
    /** Consent state of a capability (the AI is "sample"), without prompting. */
    permissionState(name: string): Promise<PermissionState | null>;
  }
}

/** An AI for unit tests that answers `answer`, streaming it in one piece. */
export function fakeSample(answer = "A fake answer."): SampleFn {
  return (async (_input, options) => {
    options?.onText?.({ text: answer, delta: answer });
    return { text: answer, truncated: false, modelTierApplied: "quick" };
  }) as SampleFn;
}

/** The AI members for fakePlatform(): `fakePlatform(fakeAi("hello"))`. */
export function fakeAi(answer?: string): {
  sample(): Promise<SampleFn>;
  permissionState(): Promise<PermissionState>;
} {
  const sample = fakeSample(answer);
  return { sample: async () => sample, permissionState: async () => "granted" };
}

const ai: Capability<"sample" | "permissionState"> = {
  methods: ["sample", "permissionState"],
  artifact: {
    sample: (claude) => claude.use("sample"),
    permissionState: async (claude, name) => {
      const permissions = await claude.use("permissions");
      return permissions ? permissions.state(name) : null;
    },
  },
  fake: fakeAi(),
};
export default ai;
