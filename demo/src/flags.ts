import { createClient, type CacheStorage, type FlagsClient } from "@flags/sdk";
import { SDK_KEYS, type Env } from "./api";

/** localStorage if the browser allows it (private modes and blocked storage can throw). */
function browserStorage(): CacheStorage | undefined {
  try {
    const storage = window.localStorage;
    storage.getItem("flags-sdk:probe");
    return storage;
  } catch {
    return undefined;
  }
}

const clients = new Map<Env, FlagsClient>();

/** One SDK client per environment (each has its own key), created on first use and kept for the page's life. */
export function clientFor(env: Env): FlagsClient {
  let client = clients.get(env);
  if (!client) {
    client = createClient({ sdkKey: SDK_KEYS[env], storage: browserStorage() });
    clients.set(env, client);
  }
  return client;
}
