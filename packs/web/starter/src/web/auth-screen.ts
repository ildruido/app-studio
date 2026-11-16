// The sign-in gate of the web app: nothing else loads until someone is signed in (unless the
// server runs with no login, SIGN_IN_MODE=none, when the web adapter skips it).
// Built with DOM calls only (no innerHTML), and styled by auth.css.

import {
  type Session,
  changePassword,
  currentSession,
  login,
  logout,
  openSignup,
  signup,
} from "./auth";
import { inviteFromHash } from "./route";
import "./auth.css";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  return el("label", { className: "auth-field" }, label, input);
}

/**
 * Resolves with the signed-in person: straight away when a session exists, else after the form.
 * `invite` (the default): sign in, or create an account from an invite link. `open`: anyone can
 * also create an account here, with no invite.
 */
export async function requireSignIn(mode: "invite" | "open" = "invite"): Promise<Session> {
  const existing = await currentSession();
  if (existing) return existing;

  const invite = mode === "invite" ? inviteFromHash(location.hash) : null;
  const open = mode === "open";
  let creating = Boolean(invite);
  const email = el("input", {
    type: "email",
    name: "email",
    autocomplete: "username",
    required: true,
  });
  const password = el("input", {
    type: "password",
    name: "password",
    required: true,
    maxLength: 200,
  });
  const message = el("p", { className: "auth-message", role: "alert" });
  const submit = el("button", { type: "submit" });
  const title = el("h1", { tabIndex: -1 });
  const lede = el("p", { className: "lede" });
  // Open sign-up only: switches the form between signing in and creating an account.
  const toggle = el("button", { type: "button", className: "link-button", id: "auth-toggle" });
  const show = () => {
    password.minLength = creating ? 10 : 1;
    password.autocomplete = creating ? "new-password" : "current-password";
    submit.textContent = creating ? "Create my account" : "Sign in";
    title.textContent = creating ? "Welcome to {{title}}" : "Sign in to {{title}}";
    lede.textContent = creating
      ? "Choose the email and password you will use to sign in. Your password needs at least 10 characters."
      : open
        ? "Use the email and password you chose when you joined, or create an account."
        : "{{title}} is invite only. Use the email and password you chose when you joined.";
    toggle.textContent = creating ? "I already have an account" : "Create an account";
    message.textContent = "";
  };
  toggle.addEventListener("click", () => {
    creating = !creating;
    show();
    email.focus();
  });
  show();
  const form = el(
    "form",
    { className: "auth-card" },
    title,
    lede,
    field("Email", email),
    field("Password", password),
    message,
    submit,
    ...(open ? [el("p", {}, toggle)] : []),
  );
  const wrap = el("main", { className: "wrap auth-wrap" }, form);
  document.body.replaceChildren(wrap);
  email.focus();

  return new Promise<Session>(() => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = "";
      const result = !creating
        ? await login(email.value.trim(), password.value)
        : invite
          ? await signup(invite, email.value.trim(), password.value)
          : await openSignup(email.value.trim(), password.value);
      if (!result.ok) {
        message.textContent = result.message;
        submit.disabled = false;
        password.focus();
        return;
      }
      // An invite is spent: drop it from the address and reload into the app.
      history.replaceState(null, "", location.pathname);
      // Reloading starts the app with the new session; this promise never resolves, so
      // nothing mounts (or calls the server) in the meantime.
      location.reload();
    });
  });
}

/** The small form behind "Change password"; hides itself after a successful change. */
function passwordForm(onDone: () => void): HTMLFormElement {
  const current = el("input", {
    type: "password",
    name: "current",
    required: true,
    maxLength: 200,
    autocomplete: "current-password",
  });
  const next = el("input", {
    type: "password",
    name: "new",
    required: true,
    minLength: 10,
    maxLength: 200,
    autocomplete: "new-password",
  });
  const message = el("p", { className: "auth-message", role: "alert" });
  const save = el("button", { type: "submit" }, "Save new password");
  const form = el(
    "form",
    { className: "auth-card password-form", id: "password-form" },
    field("Current password", current),
    field("New password (10 or more characters)", next),
    message,
    save,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    message.textContent = "";
    const result = await changePassword(current.value, next.value);
    save.disabled = false;
    if (!result.ok) {
      message.textContent = result.message;
      return;
    }
    form.reset();
    onDone();
  });
  return form;
}

/** "Signed in as …  Change password  Sign out" next to the version line. */
export function mountSessionBar(session: Session, anchor: HTMLElement): void {
  const out = el(
    "button",
    { type: "button", className: "link-button", id: "sign-out" },
    "Sign out",
  );
  out.addEventListener("click", async () => {
    out.disabled = true;
    await logout();
    location.reload();
  });
  const change = el(
    "button",
    { type: "button", className: "link-button", id: "change-password" },
    "Change password",
  );
  const status = el("span", { className: "auth-status", role: "status" });
  const form = passwordForm(() => {
    form.hidden = true;
    status.textContent = " Password changed. Your other devices were signed out.";
  });
  form.hidden = true;
  change.addEventListener("click", () => {
    form.hidden = !form.hidden;
    status.textContent = "";
    if (!form.hidden) form.querySelector("input")?.focus();
  });
  const bar = el(
    "span",
    { className: "session-bar", id: "session-bar" },
    ` · ${session.email} · `,
    change,
    " · ",
    out,
    status,
  );
  anchor.after(bar, form);
}
