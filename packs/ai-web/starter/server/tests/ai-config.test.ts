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

  describe("site-wide cap", () => {
    it("is off unless the owner sets it, and then anonymous use stays off", () => {
      const c = aiConfig({ SIGN_IN_MODE: "none" });
      expect(c.siteCap).toBeNull();
      expect(c.allowAnonymous).toBe(false);
    });
    it("reads the cap, the period and the per-address limit", () => {
      const c = aiConfig({
        AI_SITE_CAP_TOKENS: "500000",
        AI_SITE_CAP_PERIOD: "month",
        AI_PER_ADDRESS_TOKENS: "2000",
      });
      expect(c.siteCap).toEqual({ tokens: 500000, period: "month", perAddressTokens: 2000 });
      expect(aiConfig({ AI_SITE_CAP_TOKENS: "9" }).siteCap).toEqual({
        tokens: 9,
        period: "day",
        perAddressTokens: null,
      });
    });
    it("lets visitors without sign-in use the AI only in a no-login app with a cap", () => {
      expect(aiConfig({ AI_SITE_CAP_TOKENS: "9", SIGN_IN_MODE: "none" }).allowAnonymous).toBe(true);
      expect(aiConfig({ AI_SITE_CAP_TOKENS: "9", SIGN_IN_MODE: "open" }).allowAnonymous).toBe(
        false,
      );
      expect(aiConfig({ AI_SITE_CAP_TOKENS: "9" }).allowAnonymous).toBe(false);
    });
    it("rejects bad values and a per-address limit without a site cap", () => {
      expect(() => aiConfig({ AI_SITE_CAP_TOKENS: "0" })).toThrow(/AI_SITE_CAP_TOKENS/);
      expect(() => aiConfig({ AI_SITE_CAP_TOKENS: "x" })).toThrow(/AI_SITE_CAP_TOKENS/);
      expect(() => aiConfig({ AI_SITE_CAP_TOKENS: "9", AI_SITE_CAP_PERIOD: "week" })).toThrow(
        /AI_SITE_CAP_PERIOD/,
      );
      expect(() => aiConfig({ AI_PER_ADDRESS_TOKENS: "5" })).toThrow(/AI_SITE_CAP_TOKENS/);
    });
  });
});
