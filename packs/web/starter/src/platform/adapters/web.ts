import { createWebPlatform, onSignedOut } from "../web";
import type { PlatformAdapter } from "../types";

const adapter: PlatformAdapter = {
  target: "web",
  create: () => createWebPlatform(),
  // The server says who can get in (SIGN_IN_MODE). With sign-in, nothing else loads until someone
  // is signed in: the sign-in screen replaces the page; once signed in, the session bar goes next
  // to the version line (#version in index.html). With no login the page loads straight away.
  async boot() {
    const { signInMode } = await import("../../web/auth");
    const mode = await signInMode();
    if (mode === "none") {
      // Nobody can sign in, so a refused call must not reload the page to a sign-in screen.
      onSignedOut(() => undefined);
      return;
    }
    const { mountSessionBar, requireSignIn } = await import("../../web/auth-screen");
    mountSessionBar(await requireSignIn(mode), document.getElementById("version") as HTMLElement);
  },
};
export default adapter;
