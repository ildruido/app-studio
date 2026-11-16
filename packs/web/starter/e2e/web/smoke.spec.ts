import { expect, test } from "@playwright/test";
import { SIGN_IN_MODE, signUp, watchCsp } from "./helpers";

test.describe("with sign-in", () => {
  test.skip(SIGN_IN_MODE === "none", "the server runs with no login");

  test("signed out, the page shows only the sign-in screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("#status")).toHaveCount(0);
  });

  test("a new person signs up and lands in the app, with no CSP violations", async ({ page }) => {
    const violations = await watchCsp(page);
    const account = await signUp(page);
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(page.locator("#session-bar")).toContainText(account.email);
    await expect(page.locator("#status")).toContainText("Ready");
    expect(violations).toEqual([]);
  });

  test("invite-only shows no way to make an account without an invite", async ({ page }) => {
    test.skip(SIGN_IN_MODE !== "invite", "open sign-up offers it");
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create an account" })).toHaveCount(0);
  });
});

test.describe("with no login", () => {
  test.skip(SIGN_IN_MODE !== "none", "the server runs with sign-in");

  test("the page loads with no sign-in screen and no CSP violations", async ({ page }) => {
    const violations = await watchCsp(page);
    await page.goto("/");
    await expect(page.locator("#status")).toContainText("Ready");
    await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
    await expect(page.locator("#session-bar")).toHaveCount(0);
    expect(violations).toEqual([]);
  });

  test("a visitor can use shared documents but not per-person ones", async ({ request }) => {
    const put = await request.put("/api/db/doc?path=shared/e2e-visit", {
      data: { data: { at: 1 } },
    });
    expect(put.status()).toBe(204);
    const mine = await request.get("/api/db/doc?path=data/users/anyone/current");
    expect(mine.status()).toBe(403);
  });
});
