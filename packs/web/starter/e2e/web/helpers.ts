import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

// The web project runs against the real server (server/e2e/server.ts); modules that call an outside service get scripted
// stand-ins (server/e2e/modules/), and the server hands out invites on a test-only route.

/**
 * The sign-in mode the e2e server runs in: `SIGN_IN_MODE=open npx playwright test` runs the specs
 * against open sign-up, `none` against no login. Unset, it is the app's own setting from
 * .github/workflows/ci.yml (so a no-login app is tested as a no-login app), else invite-only.
 * server/e2e/server.ts reads it the same way; keep the two in step.
 */
function appSignInMode(): string | undefined {
  try {
    const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    return /^\s*SIGN_IN_MODE:\s*["']?([a-z]+)/m.exec(ci)?.[1];
  } catch {
    return undefined;
  }
}
export const SIGN_IN_MODE = process.env.SIGN_IN_MODE || appSignInMode() || "invite";

/** A fresh one-use invite link path (`/#/invite/<token>`). */
export async function newInvite(): Promise<string> {
  const res = await fetch("http://localhost:4175/__e2e/invite", { method: "POST" });
  const { token } = (await res.json()) as { token: string };
  return `/#/invite/${token}`;
}

let counter = 0;
/** A unique email and a valid password. */
export function newAccount() {
  counter += 1;
  return {
    email: `player${Date.now()}${counter}@example.com`,
    password: "correct horse battery",
  };
}

/** Make an account in the page (from an invite, or with open sign-up) and land in the app, signed in. */
export async function signUp(page: Page) {
  const account = newAccount();
  if (SIGN_IN_MODE === "open") {
    await page.goto("/");
    await page.getByRole("button", { name: "Create an account" }).click();
  } else await page.goto(await newInvite());
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.locator("#session-bar")).toContainText(account.email);
  return account;
}

/** Collect Content-Security-Policy violations and uncaught page errors; there must be none. */
export async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text());
  });
  // Any uncaught error in the page counts too.
  page.on("pageerror", (e) => violations.push(e.message));
  return violations;
}
