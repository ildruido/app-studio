import { expect, test } from "@playwright/test";

test.describe("AI endpoint", () => {
  test("refuses anyone who is not signed in", async ({ request }) => {
    const res = await request.get("/api/ai/usage");
    expect(res.status()).toBe(401);
  });
});
