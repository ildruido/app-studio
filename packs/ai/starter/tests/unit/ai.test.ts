import { afterEach, describe, expect, it, vi } from "vitest";
import { aiStatus } from "../../src/modules/ai";
import ai, { fakeAi } from "../../src/platform/capabilities/ai";
import { fakePlatform } from "../../src/platform/fake";
import { getPlatform, nullPlatform, setPlatform } from "../../src/platform";

afterEach(() => setPlatform(nullPlatform));

describe("ai module", () => {
  it("says the AI is not available where the host has none", async () => {
    expect(await getPlatform().sample()).toBeNull();
    expect(await getPlatform().permissionState("sample")).toBeNull();
    expect(await aiStatus()).toBe("The AI is not available here.");
  });

  it("says the AI is ready where the host offers it, and the fake answers", async () => {
    setPlatform(fakePlatform(fakeAi("hello")));
    expect(await aiStatus()).toBe("The AI is ready.");
    const sample = await getPlatform().sample();
    expect((await sample!("hi")).text).toBe("hello");
    expect(await getPlatform().permissionState("sample")).toBe("granted");
  });

  it("the plain fake platform has a fake AI too", async () => {
    setPlatform(fakePlatform());
    expect((await (await getPlatform().sample())!("hi")).text).toBe("A fake answer.");
  });

  it("asks the Claude artifact runtime for sample and its consent state", async () => {
    const use = vi.fn(async (name: string) =>
      name === "permissions" ? { state: async () => "prompt" } : { name },
    );
    const claude = { use } as unknown as ClaudeRuntime;
    await ai.artifact!.sample(claude);
    expect(use).toHaveBeenCalledWith("sample");
    expect(await ai.artifact!.permissionState(claude, "sample")).toBe("prompt");
  });
});
