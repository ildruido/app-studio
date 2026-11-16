import { afterEach, describe, expect, it } from "vitest";
import { aiStatus } from "../../src/modules/ai";
import { fakePlatform } from "../../src/platform/fake";
import { getPlatform, nullPlatform, setPlatform } from "../../src/platform";

afterEach(() => setPlatform(nullPlatform));

describe("ai module", () => {
  it("says the AI is not available where the host has none", async () => {
    expect(await getPlatform().sample()).toBeNull();
    expect(await aiStatus()).toBe("The AI is not available here.");
  });

  it("says the AI is ready where the host offers it, and the fake answers", async () => {
    setPlatform(fakePlatform("hello"));
    expect(await aiStatus()).toBe("The AI is ready.");
    const sample = await getPlatform().sample();
    expect((await sample!("hi")).text).toBe("hello");
  });
});
