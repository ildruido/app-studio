import { describe, expect, it } from "vitest";
import { aiConfig } from "../src/modules/ai.js";

describe("AI settings", () => {
  it("has defaults and reads overrides", () => {
    const c = aiConfig({});
    expect(c.anthropicApiKey).toBeNull();
    expect(c.defaultMonthlyAllowance).toBe(200000);
    const d = aiConfig({ ANTHROPIC_API_KEY: "k", AI_DEFAULT_ALLOWANCE: "50" });
    expect(d.anthropicApiKey).toBe("k");
    expect(d.defaultMonthlyAllowance).toBe(50);
  });
  it("defaults to the 5.5 models and reads model overrides", () => {
    const c = aiConfig({});
    expect(c.models).toEqual({ quick: "claude-haiku-5-5", default: "claude-sonnet-5-5" });
    const d = aiConfig({ AI_MODEL_QUICK: "q", AI_MODEL_DEFAULT: "d" });
    expect(d.models).toEqual({ quick: "q", default: "d" });
  });
  it("rejects a bad allowance without echoing the key", () => {
    expect(() => aiConfig({ ANTHROPIC_API_KEY: "sekrit", AI_DEFAULT_ALLOWANCE: "-1" })).toThrow(
      /AI_DEFAULT_ALLOWANCE/,
    );
  });
});
