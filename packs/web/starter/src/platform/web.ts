// The web app's platform: the same shapes as the Claude artifact runtime, backed by the
// server's /api routes (docs/API.md). The page's stores and error branches do not change; only
// this file and the providers know about HTTP. A module's capabilities come from its provider in
// src/platform/web-providers/ (the ai-web module brings the AI); without one they are null. Who is
// signed in (`user()`) is served here from the sign-in, but only when the app has the user module.

import { absentCapabilities, capabilities } from "./registry";
import { errorFromResponse, request, type Fetch } from "./web-http";
import type { Platform } from "./types";

export { onSignedOut } from "./web-http";

/** What a file in src/platform/web-providers/ default-exports: the members it serves. */
export type WebProvider = (fetchImpl: Fetch) => Partial<Platform>;

const providers = import.meta.glob<{ default: WebProvider }>("./web-providers/*.ts", {
  eager: true,
});

const json = { "content-type": "application/json" };

// ---------- documents ----------

const DB_STATUS = {
  429: "resource_exhausted",
  400: "invalid_argument",
  401: "not_granted",
  403: "not_granted",
  413: "invalid_argument",
};

class Snapshot implements DbDocumentSnapshot {
  constructor(
    readonly id: string,
    readonly exists: boolean,
    private readonly value: Record<string, unknown> | undefined,
  ) {}
  data() {
    return this.value;
  }
}

class QueryResult implements DbQuerySnapshot {
  readonly size: number;
  readonly empty: boolean;
  constructor(readonly docs: DbDocumentSnapshot[]) {
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
}

interface Clause {
  field: string;
  op: string;
  value: unknown;
}

export function webDb(fetchImpl: Fetch = fetch): DbApi {
  const call = async (input: string, init?: RequestInit) => {
    const res = await request(fetchImpl, input, init);
    if (!res.ok) throw await errorFromResponse(res, DB_STATUS);
    return res;
  };

  class Query implements DbQuery {
    constructor(
      readonly path: string,
      private readonly spec: {
        where: Clause[];
        orderBy?: { field: string; dir: string };
        limit?: number;
      } = { where: [] },
    ) {}
    where(field: string, op: string, value: unknown): DbQuery {
      return new Query(this.path, {
        ...this.spec,
        where: [...this.spec.where, { field, op, value }],
      });
    }
    orderBy(field: string, dir: "asc" | "desc" = "asc"): DbQuery {
      return new Query(this.path, { ...this.spec, orderBy: { field, dir } });
    }
    limit(n: number): DbQuery {
      return new Query(this.path, { ...this.spec, limit: n });
    }
    async get(): Promise<DbQuerySnapshot> {
      const { where, orderBy, limit } = this.spec;
      const res = await call("/api/db/query", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ path: this.path, ...(where.length && { where }), orderBy, limit }),
      });
      const body = (await res.json()) as { docs: { id: string; data: Record<string, unknown> }[] };
      return new QueryResult(body.docs.map((d) => new Snapshot(d.id, true, d.data)));
    }
  }

  class Collection extends Query implements DbCollectionReference {
    doc(id: string = crypto.randomUUID()): DbDocumentReference {
      return new Doc(`${this.path}/${id}`);
    }
  }

  class Doc implements DbDocumentReference {
    readonly id: string;
    constructor(readonly path: string) {
      this.id = path.slice(path.lastIndexOf("/") + 1);
    }
    private url() {
      return `/api/db/doc?path=${encodeURIComponent(this.path)}`;
    }
    async get(): Promise<DbDocumentSnapshot> {
      const res = await call(this.url());
      const body = (await res.json()) as { exists: boolean; data?: Record<string, unknown> };
      return new Snapshot(this.id, body.exists, body.exists ? body.data : undefined);
    }
    async set(data: Record<string, unknown>): Promise<void> {
      await call(this.url(), { method: "PUT", headers: json, body: JSON.stringify({ data }) });
    }
    async delete(): Promise<void> {
      await call(this.url(), { method: "DELETE" });
    }
    collection(path: string): DbCollectionReference {
      return new Collection(`${this.path}/${path}`);
    }
  }

  return {
    doc: (path) => new Doc(path),
    collection: (path) => new Collection(path),
  };
}

// ---------- the web platform ----------

/** Who is signed in, from the sign-in (`/api/auth/me`); id() is null when nobody is. */
export function webUser(fetchImpl: Fetch = fetch): UserApi {
  return {
    id: async () => {
      try {
        const res = await request(fetchImpl, "/api/auth/me");
        if (!res.ok) return null;
        const body = (await res.json()) as { userId?: unknown };
        return typeof body.userId === "string" ? body.userId : null;
      } catch {
        return null;
      }
    },
  };
}

/** True when the app has the user module, which declares `user()` (src/platform/capabilities/). */
const hasUserModule = () =>
  capabilities.some((c) => (c.methods as readonly string[]).includes("user"));

export function createWebPlatform(fetchImpl: Fetch = fetch): Platform {
  const db = webDb(fetchImpl);
  const user = webUser(fetchImpl);
  const downloads: DownloadsFn = {
    async save({ filename, data }) {
      const blob = typeof data === "string" ? new Blob([data], { type: "application/json" }) : data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { status: "saved" };
    },
  };
  const served = Object.keys(providers)
    .sort()
    .map((name) => providers[name]!.default(fetchImpl));
  return {
    ...absentCapabilities(),
    ...Object.assign({}, ...served),
    ...(hasUserModule() && { user: async () => user }),
    hasRuntime: () => true,
    db: async () => db,
    downloads: async () => downloads,
  } as Platform;
}
