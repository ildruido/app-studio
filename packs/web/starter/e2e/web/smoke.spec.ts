import { expect, test } from "@playwright/test";
import { signUp, watchCsp } from "./helpers";

test("signed out, the page shows only the sign-in screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("#status")).toHaveCount(0);
});

test("an invited person signs up and lands in the app, with no CSP violations", async ({
  page,
}) => {
  const violations = await watchCsp(page);
  const account = await signUp(page);
  await expect(page.locator("#page-title")).toBeVisible();
  await expect(page.locator("#session-bar")).toContainText(account.email);
  // The scripted AI behind /api/coach makes the AI available.
  await expect(page.locator("#status")).toContainText("ready");
  expect(violations).toEqual([]);
});
