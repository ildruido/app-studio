import { describe, expect, it } from "vitest";
import {
  defaultLang,
  isLang,
  languages,
  otherLang,
  path,
  postLang,
  postSlug,
  ui,
} from "../../src/lib/i18n";

describe("i18n", () => {
  it("has the same words in every language", () => {
    const keys = Object.keys(ui[defaultLang]).sort();
    for (const lang of languages) expect(Object.keys(ui[lang]).sort()).toEqual(keys);
  });

  it("knows the languages and the other one", () => {
    expect(isLang("it")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(otherLang("en")).toBe("it");
    expect(otherLang("it")).toBe("en");
  });

  it("builds addresses with one trailing slash", () => {
    expect(path("en")).toBe("/en/");
    expect(path("it", "blog/")).toBe("/it/blog/");
    expect(path("it", "/blog/ciao")).toBe("/it/blog/ciao/");
  });

  it("reads a post's language and slug from its id", () => {
    expect(postLang("it/ciao")).toBe("it");
    expect(postLang("fr/salut")).toBeUndefined();
    expect(postLang("loose")).toBeUndefined();
    expect(postSlug("en/series/one")).toBe("series/one");
  });
});
