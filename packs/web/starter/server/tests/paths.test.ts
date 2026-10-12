import { describe, expect, it } from "vitest";
import { PathError, canAccess, collectionPath, docPath, parsePath } from "../src/paths.js";

describe("paths", () => {
  it("accepts the paths the page uses", () => {
    expect(docPath("data/users/u1/current")).toHaveLength(4);
    expect(docPath("data/users/u1/history/items/g1")).toHaveLength(6);
    expect(docPath("shared/lesson.l1")).toHaveLength(2);
    expect(collectionPath("shared/lesson.l1/entries")).toHaveLength(3);
  });

  it("rejects bad shapes", () => {
    for (const p of [
      "",
      "a//b",
      "/a/b",
      "a/b/",
      "a/../b",
      "a/./b",
      "a/b c",
      "a/b?x",
      5,
      undefined,
    ]) {
      expect(() => parsePath(p), String(p)).toThrow(PathError);
    }
    expect(() => parsePath("a/".repeat(9) + "b")).toThrow(PathError);
    expect(() => docPath("shared/x/entries")).toThrow(PathError);
    expect(() => collectionPath("shared/x")).toThrow(PathError);
  });

  it("limits a user to their own data and opens only the shared paths", () => {
    expect(canAccess(["data", "users", "u1", "current"], "u1")).toBe(true);
    expect(canAccess(["data", "users", "u1", "history", "items"], "u1")).toBe(true);
    expect(canAccess(["data", "users", "u2", "current"], "u1")).toBe(false);
    expect(canAccess(["data", "users", "u1"], "u1")).toBe(false);
    expect(canAccess(["data", "other", "u1", "x"], "u1")).toBe(false);
    expect(canAccess(["shared", "lesson.l1"], "u1")).toBe(true);
    expect(canAccess(["secrets", "x"], "u1")).toBe(false);
  });
});
