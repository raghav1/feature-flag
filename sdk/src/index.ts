// Client SDK for the feature flag service.
//
//   const flags = createClient({ sdkKey: "prod-sdk-key" });
//   await flags.load(user);                    // before first render
//   if (flags.isEnabled("new-dashboard", user)) { ... }
//
// Results come from POST /api/evaluate (server-side evaluation, so no rules ever reach the client) and are
// cached in memory per user. The cache is refreshed by polling and, where EventSource exists, by the live
// change stream. When the backend is unreachable, the last known results keep being served (marked stale).

export type Reason = "FLAG_OFF" | "RULE_MATCH" | "OTHERWISE" | "FLAG_NOT_FOUND";

export interface FlagResult {
  value: boolean;
  reason: Reason;
  /** Zero-based; present only when reason is RULE_MATCH. */
  ruleIndex?: number;
  /** "users" | "customers" | "percent" | "attribute"; present only when reason is RULE_MATCH. */
  ruleType?: string;
}

export interface User {
  /** Absent for anonymous visitors (who never match percentage rollouts). */
  id?: string;
  /** e.g. { customer: "acme" } */
  attributes?: Record<string, string>;
}

/**
 * - loading: never fetched for this user yet
 * - fresh: the last fetch succeeded
 * - stale: the last fetch failed; serving earlier results
 * - unavailable: no results at all (first fetch failed); isEnabled returns the fallback
 */
export type CacheStatus = "loading" | "fresh" | "stale" | "unavailable";

export interface UserState {
  status: CacheStatus;
  flags: Record<string, FlagResult>;
  /** When results were last fetched successfully (epoch ms). */
  updatedAt?: number;
  /** Why the last fetch failed. */
  error?: string;
}

export type LiveStatus = "off" | "connecting" | "live" | "reconnecting";

/** Minimal storage interface; window.localStorage fits. */
export interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ClientOptions {
  sdkKey: string;
  /** Default "" (same origin). */
  baseUrl?: string;
  /** Default 30 s; 0 turns polling off. */
  pollIntervalMs?: number;
  /** Default 3 s. */
  requestTimeoutMs?: number;
  /** Subscribe to the live change stream when EventSource is available. Default true. */
  live?: boolean;
  /** Users kept in the cache, least recently used dropped first. Default 100. */
  maxUsers?: number;
  /** Persist results so they survive a reload during an outage. Default: none. */
  storage?: CacheStorage;
  /** For tests or non-browser runtimes. */
  fetch?: typeof fetch;
  EventSource?: typeof EventSource;
}

export interface FlagsClient {
  /** Fetches (or refreshes) results for this user. Never rejects: failures show up in state(user). */
  load(user: User): Promise<void>;
  /** From the cache, synchronously. Unknown user or flag → fallback (OFF), and an unknown user starts loading. */
  isEnabled(flagKey: string, user: User, fallback?: boolean): boolean;
  /** Cached results and freshness for this user. */
  state(user: User): UserState;
  liveStatus(): LiveStatus;
  /** Called after any cache or status change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Refetches every cached user now. */
  refresh(): Promise<void>;
  /** Stops polling and the live stream. */
  close(): void;
}

interface Entry {
  user: User;
  state: UserState;
}

interface EvaluateResponse {
  environment: string;
  flags: Record<string, FlagResult>;
}

const MAX_BACKOFF_MS = 30_000;
const LOADING: UserState = Object.freeze({ status: "loading", flags: Object.freeze({}) }) as UserState;

/** Stable cache key: the same id and attributes (in any order) mean the same user. */
export function userKey(user: User): string {
  const attributes = Object.entries(user.attributes ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([user.id ?? null, attributes]);
}

export function createClient(options: ClientOptions): FlagsClient {
  const baseUrl = options.baseUrl ?? "";
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 3_000;
  const maxUsers = options.maxUsers ?? 100;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const EventSourceImpl = options.EventSource ?? (globalThis as { EventSource?: typeof EventSource }).EventSource;
  const storageKey = `flags-sdk:${options.sdkKey}`;

  const entries = new Map<string, Entry>(); // insertion order = least recently used first
  const inFlight = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let live: LiveStatus = "off";
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const notify = () => listeners.forEach((listener) => listener());

  function touch(key: string, entry: Entry) {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > maxUsers) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  function persist() {
    if (!options.storage) return;
    const saved: Record<string, Entry> = {};
    entries.forEach((entry, key) => {
      if (entry.state.updatedAt !== undefined) saved[key] = entry;
    });
    try {
      options.storage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      // storage full or blocked: the in-memory cache still works
    }
  }

  function restore() {
    if (!options.storage) return;
    try {
      const saved = JSON.parse(options.storage.getItem(storageKey) ?? "{}") as Record<string, Entry>;
      for (const [key, entry] of Object.entries(saved)) {
        // From an earlier session: usable, but not fresh until refetched.
        touch(key, { user: entry.user, state: { ...entry.state, status: "stale" } });
      }
    } catch {
      // unreadable or blocked storage: start empty
    }
  }

  async function fetchFlags(user: User): Promise<Record<string, FlagResult>> {
    const response = await fetchImpl(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SDK-Key": options.sdkKey },
      body: JSON.stringify({ context: { ...(user.id ? { userId: user.id } : {}), attributes: user.attributes ?? {} } }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "SDK key rejected (HTTP 401)" : `HTTP ${response.status}`);
    }
    return ((await response.json()) as EvaluateResponse).flags;
  }

  function load(user: User): Promise<void> {
    const key = userKey(user);
    const running = inFlight.get(key);
    if (running) return running;

    const attempt = fetchFlags(user)
      .then((flags) => {
        touch(key, { user, state: { status: "fresh", flags, updatedAt: Date.now() } });
        persist();
      })
      .catch((error: unknown) => {
        const previous = entries.get(key)?.state;
        const message = error instanceof Error ? error.message : String(error);
        const state: UserState =
          previous && previous.updatedAt !== undefined
            ? { ...previous, status: "stale", error: message }
            : { status: "unavailable", flags: {}, error: message };
        touch(key, { user, state });
      })
      .finally(() => {
        inFlight.delete(key);
        startPolling();
        notify();
      });
    inFlight.set(key, attempt);
    return attempt;
  }

  async function refresh(): Promise<void> {
    await Promise.all([...entries.values()].map((entry) => load(entry.user)));
  }

  function startPolling() {
    if (pollTimer !== undefined || closed || pollIntervalMs <= 0) return;
    pollTimer = setInterval(() => void refresh(), pollIntervalMs);
  }

  function connectLive() {
    if (options.live === false || !EventSourceImpl) return;
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let backoffMs = 1000;
    let connectedBefore = false;

    const setLive = (next: LiveStatus) => {
      if (live !== next) {
        live = next;
        notify();
      }
    };

    const connect = () => {
      if (closed) return;
      source = new EventSourceImpl(`${baseUrl}/api/evaluate/stream?${new URLSearchParams({ sdkKey: options.sdkKey })}`);
      source.addEventListener("ready", () => {
        // Events sent while disconnected are lost: catch up after every reconnect.
        if (connectedBefore) void refresh();
        connectedBefore = true;
        backoffMs = 1000;
        setLive("live");
      });
      source.addEventListener("changed", () => void refresh());
      source.onerror = () => {
        setLive("reconnecting");
        // EventSource retries network errors itself, but an HTTP error (e.g. a proxy's 502) closes it for good.
        if (source?.readyState === EventSourceImpl.CLOSED && !closed) {
          retryTimer = setTimeout(connect, backoffMs);
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        }
      };
    };

    setLive("connecting");
    connect();
    stopLive = () => {
      clearTimeout(retryTimer);
      source?.close();
      live = "off";
    };
  }

  let stopLive = () => {};
  restore();
  connectLive();

  return {
    load,
    isEnabled(flagKey, user, fallback = false) {
      const key = userKey(user);
      const entry = entries.get(key);
      if (!entry) {
        void load(user);
        return fallback;
      }
      touch(key, entry); // reading counts as use, so active users aren't evicted
      return entry.state.flags[flagKey]?.value ?? fallback;
    },
    state(user) {
      return entries.get(userKey(user))?.state ?? LOADING;
    },
    liveStatus: () => live,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    close() {
      closed = true;
      clearInterval(pollTimer);
      stopLive();
      listeners.clear();
    },
  };
}
