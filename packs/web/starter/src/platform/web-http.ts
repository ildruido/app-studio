// DOM-free helpers for the web platform (docs/API.md): one way to call the server, and turning
// server failures into the error shapes the page already branches on. Module providers in
// src/platform/web-providers/ use them too.

export type Fetch = typeof fetch;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

let signedOutHandler: () => void = () => globalThis.location?.reload();
let signedOutOnce = false;
/** Tests replace the page reload that follows a lost session. */
export function onSignedOut(handler: () => void): void {
  signedOutHandler = handler;
  signedOutOnce = false;
}

export async function request(
  fetchImpl: Fetch,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    const res = await fetchImpl(input, { credentials: "same-origin", ...init });
    // The session ended (signed out on another device, or expired): reload, so the page shows
    // the sign-in screen instead of failing on every save. Sign-in's own calls are left alone.
    if (res.status === 401 && !input.startsWith("/api/auth/") && !signedOutOnce) {
      signedOutOnce = true;
      signedOutHandler();
    }
    return res;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    throw networkError();
  }
}

/** The server's `{error:{code,message}}` body, or a code made from the status. */
export async function errorFromResponse(
  res: Response,
  statusCodes: Record<number, string>,
): Promise<{ code: string; message: string }> {
  try {
    const body: unknown = await res.json();
    const err = isObj(body) && isObj(body.error) ? body.error : null;
    if (err && typeof err.code === "string") {
      // Sign-in problems reach the page as "not granted" so its existing branches apply.
      const code = err.code === "unauthenticated" ? "not_granted" : err.code;
      return { code, message: typeof err.message === "string" ? err.message : code };
    }
  } catch {
    // Not JSON: fall through to the status.
  }
  const code = statusCodes[res.status] ?? "resource_exhausted";
  return { code, message: `The server answered ${res.status}.` };
}

/** Fetch failures (offline, server down) carry no status. */
export const networkError = (): { code: string; message: string } => ({
  code: "resource_exhausted",
  message: "Could not reach the server. Check your connection and try again.",
});
