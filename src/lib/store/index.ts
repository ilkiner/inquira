import "server-only";
import postgres from "postgres";
import { memoryStore } from "./memory";
import { createPostgresStore } from "./postgres";
import type { Store } from "./types";

let store: Store | undefined;

// Postgres when DATABASE_URL is set (Neon, Supabase, any host), otherwise an
// in-memory store for local demos.
export function getStore(): Store {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (!url) return (store = memoryStore);

  // `prepare: false` keeps it compatible with transaction-mode poolers (Neon, PgBouncer).
  const sql = postgres(url, { max: 5, prepare: false });
  store = createPostgresStore(
    (text, params = []) => sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]) as never,
  );
  return store;
}

export const usingMemoryStore = () => !process.env.DATABASE_URL;

export type { Store } from "./types";
