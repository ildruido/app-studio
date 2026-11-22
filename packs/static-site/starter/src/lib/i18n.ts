// Languages and the words the site itself uses (posts bring their own text).
export const languages = ["en", "it"] as const;
export type Lang = (typeof languages)[number];
export const defaultLang: Lang = "en";

export const ui = {
  en: {
    siteTitle: "{{title}}",
    skip: "Skip to content",
    home: "Home",
    blog: "Blog",
    language: "Italiano",
    welcome: "Welcome",
    intro: "A static site: fast, free to host and easy to keep.",
    noPosts: "No posts yet.",
    notFound: "This page does not exist.",
    back: "Back to the blog",
  },
  it: {
    siteTitle: "{{title}}",
    skip: "Vai al contenuto",
    home: "Home",
    blog: "Blog",
    language: "English",
    welcome: "Benvenuto",
    intro: "Un sito statico: veloce, gratuito da ospitare e facile da mantenere.",
    noPosts: "Ancora nessun articolo.",
    notFound: "Questa pagina non esiste.",
    back: "Torna al blog",
  },
} satisfies Record<Lang, Record<string, string>>;

export function isLang(value: string | undefined): value is Lang {
  return (languages as readonly string[]).includes(value ?? "");
}

export function otherLang(lang: Lang): Lang {
  return lang === "en" ? "it" : "en";
}

/** The site-relative address of a page in a language, with the trailing slash the site uses. */
export function path(lang: Lang, rest = ""): string {
  return `/${lang}/${rest.replace(/^\/+/, "")}`.replace(/\/*$/, "/");
}

/** The language a post belongs to: its folder name ("en/hello" is English). */
export function postLang(id: string): Lang | undefined {
  const first = id.split("/")[0];
  return isLang(first) ? first : undefined;
}

/** The part of a post's id after its language folder ("en/hello" gives "hello"). */
export function postSlug(id: string): string {
  return id.split("/").slice(1).join("/");
}
