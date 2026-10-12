import { createWebPlatform } from "../web";
import type { PlatformAdapter } from "../types";

const adapter: PlatformAdapter = {
  target: "web",
  create: () => createWebPlatform(),
  // Nothing else loads until someone is signed in. The sign-in screen replaces the page; once
  // signed in, the session bar goes next to the version line (#version in index.html).
  async boot() {
    const { mountSessionBar, requireSignIn } = await import("../../web/auth-screen");
    mountSessionBar(await requireSignIn(), document.getElementById("version") as HTMLElement);
  },
};
export default adapter;
