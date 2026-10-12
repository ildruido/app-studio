// Document paths: slash-separated segments; even count = document, odd count = collection.

const SEGMENT = /^[A-Za-z0-9._~-]{1,128}$/;
const MAX_DEPTH = 8;
const MAX_PATH = 512;

export class PathError extends Error {}

export function parsePath(path: unknown): string[] {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH) {
    throw new PathError("path must be 1 to 512 characters");
  }
  const parts = path.split("/");
  if (parts.length > MAX_DEPTH) throw new PathError("path is too deep");
  for (const p of parts) {
    if (p === "." || p === ".." || !SEGMENT.test(p))
      throw new PathError("path has an invalid segment");
  }
  return parts;
}

export function docPath(path: unknown): string[] {
  const parts = parsePath(path);
  if (parts.length % 2 !== 0) throw new PathError("path must point at a document");
  return parts;
}

export function collectionPath(path: unknown): string[] {
  const parts = parsePath(path);
  if (parts.length % 2 !== 1) throw new PathError("path must point at a collection");
  return parts;
}

/**
 * Who may touch a path. `data/users/<userId>/...` belongs to that user alone. `shared/...` is
 * open to every signed-in user (fine for a private app with a few invited people; record the
 * decision in docs/PRD.md). Anything else is closed.
 */
export function canAccess(parts: string[], userId: string): boolean {
  if (parts[0] === "data") return parts[1] === "users" && parts[2] === userId && parts.length > 3;
  return parts[0] === "shared";
}
