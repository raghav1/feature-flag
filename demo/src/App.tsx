import { useRef, useState, useSyncExternalStore } from "react";
import type { Env } from "./api";
import { DebugPanel } from "./DebugPanel";
import { clientFor } from "./flags";
import { Storefront } from "./Storefront";
import { DEMO_USERS, label, sdkUser, toSearch, type Selection } from "./users";

interface AppProps {
  initialSelection: Selection;
  resolvedInMs: number;
}

export function App({ initialSelection, resolvedInMs }: AppProps) {
  const [selection, setSelection] = useState(initialSelection);
  const [pending, setPending] = useState<Selection | null>(null);
  const latestRequest = useRef<Selection | null>(null);

  const client = clientFor(selection.env);
  const user = sdkUser(selection.user);
  // Re-render whenever the SDK's cache or live status changes (polling, live events, outages).
  const state = useSyncExternalStore(client.subscribe, () => client.state(user));
  const live = useSyncExternalStore(client.subscribe, () => client.liveStatus());
  const isOn = (key: string) => state.flags[key]?.value === true;

  /** Keep showing the current user until the next one's flags are loaded, then swap all at once. */
  async function select(next: Selection) {
    latestRequest.current = next;
    setPending(next);
    window.history.replaceState(null, "", toSearch(next));
    await clientFor(next.env).load(sdkUser(next.user));
    if (latestRequest.current === next) {
      setSelection(next);
      setPending(null);
    }
  }

  const shown = pending ?? selection;

  return (
    <div className={isOn("dark-mode") ? "page dark" : "page"}>
      <header className="topbar">
        <strong className="brand">Corner Shop</strong>
        <span className="tag">demo storefront</span>
        <div className="controls">
          <label>
            Viewing as{" "}
            <select
              value={shown.user.key}
              onChange={(e) => {
                const next = DEMO_USERS.find((u) => u.key === e.target.value);
                if (next) void select({ ...shown, user: next });
              }}
            >
              {DEMO_USERS.map((u) => (
                <option key={u.key} value={u.key}>
                  {label(u)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Env{" "}
            <select value={shown.env} onChange={(e) => void select({ ...shown, env: e.target.value as Env })}>
              <option value="prod">prod</option>
              <option value="dev">dev</option>
            </select>
          </label>
          <button type="button" onClick={() => void client.refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {state.status === "unavailable" && (
        <p className="banner" role="alert">
          Couldn't reach the flag service, so every feature is OFF. {state.error}
        </p>
      )}
      {state.status === "stale" && (
        <p className="banner" role="status">
          The flag service is unreachable; showing the last known flags.
        </p>
      )}

      <div className="layout">
        <Storefront
          isOn={isOn}
          customer={selection.user.customer}
          name={selection.user.userId ? selection.user.name : undefined}
        />
        <DebugPanel
          flags={state.flags}
          env={selection.env}
          user={label(selection.user)}
          updating={pending !== null}
          live={live}
          cache={state.status}
          resolvedInMs={resolvedInMs}
        />
      </div>
    </div>
  );
}
