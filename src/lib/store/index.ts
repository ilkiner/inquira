import "server-only";
import { memoryStore } from "./memory";
import { createSupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | undefined;

// Supabase when configured, otherwise an in-memory store for local demos.
export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  store = url && key ? createSupabaseStore(url, key) : memoryStore;
  return store;
}

export const usingMemoryStore = () => !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export type { Store } from "./types";
