import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, userKey, type CacheStorage, type FlagResult, type FlagsClient, type User } from "./index";

/** A pretend backend: per-user results, an outage switch, and a log of requests. */
class FakeServer {
  results = new Map<string, Record<string, FlagResult>>();
  down = false;
  status = 200;
  requests: { url: string; sdkKey: string | null; body: unknown }[] = [];

  set(userId: string | undefined, flags: Record<string, boolean>) {
    const results: Record<string, FlagResult> = {};
    for (const [key, value] of Object.entries(flags)) results[key] = { value, reason: value ? "RULE_MATCH" : "OTHERWISE" };
    this.results.set(userId ?? "", results);
  }

  fetch = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { context: { userId?: string } };
    this.requests.push({ url, sdkKey: new Headers(init?.headers).get("X-SDK-Key"), body });
    if (this.down) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ environment: "prod", flags: this.results.get(body.context.userId ?? "") ?? {} }), {
      status: this.status,
    });
  }) as typeof fetch;
}

/** Stands in for EventSource: the test emits events and errors. */
class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 1;
  onerror: (() => void) | null = null;
  private handlers = new Map<string, () => void>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, handler: () => void) {
    this.handlers.set(name, handler);
  }

  emit(name: string) {
    this.handlers.get(name)?.();
  }

  /** closed=true mimics an HTTP error, which ends an EventSource for good. */
  fail(closed: boolean) {
    if (closed) this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  static latest(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1);
    if (!latest) throw new Error("no EventSource opened");
    return latest;
  }
}

class MemoryStorage implements CacheStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
}

const ben: User = { id: "u_207", attributes: { customer: "acme" } };
const eli: User = { id: "u_412" };

let server: FakeServer;
let client: FlagsClient;

function makeClient(overrides: Partial<Parameters<typeof createClient>[0]> = {}) {
  client = createClient({
    sdkKey: "prod-sdk-key",
    fetch: server.fetch,
    live: false,
    pollIntervalMs: 0,
    ...overrides,
  });
  return client;
}

beforeEach(() => {
  server = new FakeServer();
  server.set("u_207", { "new-dashboard": true, "dark-mode": false });
  server.set("u_412", { "new-dashboard": false });
  FakeEventSource.instances = [];
});

afterEach(() => {
  client?.close();
  vi.useRealTimers();
});

describe("isEnabled", () => {
  it("answers from the cache after load", async () => {
    makeClient();
    await client.load(ben);

    expect(client.isEnabled("new-dashboard", ben)).toBe(true);
    expect(client.isEnabled("dark-mode", ben)).toBe(false);
    expect(client.state(ben).status).toBe("fresh");
  });

  it("returns the fallback for flags it doesn't know", async () => {
    makeClient();
    await client.load(ben);

    expect(client.isEnabled("no-such-flag", ben)).toBe(false);
    expect(client.isEnabled("no-such-flag", ben, true)).toBe(true);
  });

  it("for an unseen user, returns the fallback now, loads once, and notifies when ready", async () => {
    makeClient();
    const listener = vi.fn();
    client.subscribe(listener);

    expect(client.isEnabled("new-dashboard", ben)).toBe(false);
    expect(client.isEnabled("new-dashboard", ben)).toBe(false);
    await client.load(ben); // joins the load already in flight

    expect(server.requests).toHaveLength(1);
    expect(listener).toHaveBeenCalled();
    expect(client.isEnabled("new-dashboard", ben)).toBe(true);
  });

  it("keeps users apart, and treats attribute order as irrelevant", async () => {
    makeClient();
    await Promise.all([client.load(ben), client.load(eli)]);

    expect(client.isEnabled("new-dashboard", ben)).toBe(true);
    expect(client.isEnabled("new-dashboard", eli)).toBe(false);
    expect(userKey({ id: "u", attributes: { a: "1", b: "2" } })).toBe(userKey({ id: "u", attributes: { b: "2", a: "1" } }));
  });
});

describe("requests", () => {
  it("send the SDK key and the user's context; anonymous users send no userId", async () => {
    makeClient({ baseUrl: "https://flags.example" });
    await client.load(ben);
    await client.load({});

    expect(server.requests[0]).toEqual({
      url: "https://flags.example/api/evaluate",
      sdkKey: "prod-sdk-key",
      body: { context: { userId: "u_207", attributes: { customer: "acme" } } },
    });
    expect(server.requests[1]?.body).toEqual({ context: { attributes: {} } });
  });

  it("dedupe concurrent loads for the same user", async () => {
    makeClient();
    await Promise.all([client.load(ben), client.load(ben), client.load({ ...ben })]);

    expect(server.requests).toHaveLength(1);
  });
});

describe("outages", () => {
  it("keep serving the last results, marked stale, and recover", async () => {
    makeClient();
    await client.load(ben);

    server.down = true;
    await client.refresh();

    expect(client.isEnabled("new-dashboard", ben)).toBe(true);
    expect(client.state(ben)).toMatchObject({ status: "stale", error: "Failed to fetch" });

    server.down = false;
    server.set("u_207", { "new-dashboard": false });
    await client.refresh();

    expect(client.isEnabled("new-dashboard", ben)).toBe(false);
    expect(client.state(ben).status).toBe("fresh");
  });

  it("with no results yet: load resolves anyway, the user is unavailable, and isEnabled gives the fallback", async () => {
    server.down = true;
    makeClient();

    await expect(client.load(ben)).resolves.toBeUndefined();

    expect(client.state(ben).status).toBe("unavailable");
    expect(client.isEnabled("new-dashboard", ben)).toBe(false);
    expect(client.isEnabled("new-dashboard", ben, true)).toBe(true);
  });

  it("treat HTTP errors as failures and say when the key is rejected", async () => {
    server.status = 401;
    makeClient();
    await client.load(ben);

    expect(client.state(ben)).toMatchObject({ status: "unavailable", error: "SDK key rejected (HTTP 401)" });
  });

  it("time out a hanging request instead of waiting forever", async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
    makeClient({ fetch: hanging, requestTimeoutMs: 20 });

    await client.load(ben);

    expect(client.state(ben).status).toBe("unavailable");
  });

  it("survive a reload when given storage: stored results are served as stale until refreshed", async () => {
    const storage = new MemoryStorage();
    makeClient({ storage });
    await client.load(ben);
    client.close();

    server.down = true;
    makeClient({ storage }); // e.g. the page reloaded during an outage
    await client.load(ben);

    expect(client.isEnabled("new-dashboard", ben)).toBe(true);
    expect(client.state(ben).status).toBe("stale");
  });

  it("ignore unreadable storage", async () => {
    const storage = new MemoryStorage();
    storage.setItem("flags-sdk:prod-sdk-key", "{not json");
    makeClient({ storage });
    await client.load(ben);

    expect(client.isEnabled("new-dashboard", ben)).toBe(true);
  });
});

describe("polling", () => {
  it("refreshes every cached user on the interval and notifies listeners", async () => {
    vi.useFakeTimers();
    makeClient({ pollIntervalMs: 30_000 });
    await client.load(ben);
    const listener = vi.fn();
    client.subscribe(listener);

    server.set("u_207", { "new-dashboard": false });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(server.requests).toHaveLength(2);
    expect(client.isEnabled("new-dashboard", ben)).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it("stops when the client is closed", async () => {
    vi.useFakeTimers();
    makeClient({ pollIntervalMs: 1_000 });
    await client.load(ben);

    client.close();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(server.requests).toHaveLength(1);
  });
});

describe("live updates", () => {
  function liveClient() {
    return makeClient({ live: true, EventSource: FakeEventSource as unknown as typeof EventSource });
  }

  it("connects to the environment's stream with the SDK key", () => {
    liveClient();

    expect(FakeEventSource.latest().url).toBe("/api/evaluate/stream?sdkKey=prod-sdk-key");
    expect(client.liveStatus()).toBe("connecting");
    FakeEventSource.latest().emit("ready");
    expect(client.liveStatus()).toBe("live");
  });

  it("refreshes cached users on a change event", async () => {
    liveClient();
    await client.load(ben);
    FakeEventSource.latest().emit("ready");

    server.set("u_207", { "new-dashboard": false });
    FakeEventSource.latest().emit("changed");
    await vi.waitFor(() => expect(client.isEnabled("new-dashboard", ben)).toBe(false));
  });

  it("catches up after a reconnect, since events sent while disconnected are lost", async () => {
    liveClient();
    await client.load(ben);
    const stream = FakeEventSource.latest();
    stream.emit("ready");

    stream.fail(false); // network blip: EventSource retries by itself
    expect(client.liveStatus()).toBe("reconnecting");
    server.set("u_207", { "new-dashboard": false }); // changed while we weren't listening
    stream.emit("ready");

    await vi.waitFor(() => expect(client.isEnabled("new-dashboard", ben)).toBe(false));
    expect(client.liveStatus()).toBe("live");
  });

  it("reopens the stream itself after an HTTP error, backing off", async () => {
    vi.useFakeTimers();
    liveClient();
    const first = FakeEventSource.latest();

    first.fail(true); // e.g. a proxy's 502 while the backend is down
    expect(FakeEventSource.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.latest().fail(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeEventSource.instances).toHaveLength(2); // second wait is 2 s
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it("can be turned off", () => {
    makeClient({ live: false, EventSource: FakeEventSource as unknown as typeof EventSource });

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(client.liveStatus()).toBe("off");
  });

  it("closes the stream on close", () => {
    liveClient();
    client.close();

    expect(FakeEventSource.latest().readyState).toBe(FakeEventSource.CLOSED);
    expect(client.liveStatus()).toBe("off");
  });
});

describe("cache size", () => {
  it("drops the least recently used user beyond maxUsers", async () => {
    makeClient({ maxUsers: 2 });
    await client.load(ben);
    await client.load(eli);
    client.isEnabled("new-dashboard", ben); // ben is now the most recently used
    await client.load({ id: "u_999" });

    expect(client.state(eli).status).toBe("loading"); // evicted
    expect(client.state(ben).status).toBe("fresh");
  });
});
