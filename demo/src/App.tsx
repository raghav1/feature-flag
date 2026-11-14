import { CloudOff, RefreshCw, Store, TriangleAlert } from "lucide-react";
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

const ENVS: { value: Env; label: string }[] = [
  { value: "dev", label: "Dev" },
  { value: "prod", label: "Prod" },
];

export function App({ initialSelection, resolvedInMs }: AppProps) {
  const [selection, setSelection] = useState(initialSelection);
  const [pending, setPending] = useState<Selection | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  async function refresh() {
    setRefreshing(true);
    try {
      await client.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const shown = pending ?? selection;

  // The theme is itself a feature flag: dark-mode decides it, not the visitor's system setting.
  return (
    <div className="page" data-theme={isOn("dark-mode") ? "dark" : "light"}>
      <header className="header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Store size={18} />
          </span>
          Corner Shop
        </span>
        <span className="label">Demo storefront</span>

        <div className="controls">
          <label className="field">
            <span className="field-label">Viewing as</span>
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

          <span className="segmented" role="radiogroup" aria-label="Environment">
            {ENVS.map((e) => (
              <button
                key={e.value}
                type="button"
                role="radio"
                aria-checked={shown.env === e.value}
                className={shown.env === e.value ? "selected" : undefined}
                onClick={() => {
                  if (shown.env !== e.value) void select({ ...shown, env: e.value });
                }}
              >
                {e.label}
              </button>
            ))}
          </span>

          <button
            type="button"
            className={refreshing ? "icon-button spinning" : "icon-button"}
            aria-label="Refresh flags"
            title="Refresh flags"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {state.status === "unavailable" && (
        <p className="flash danger" role="alert">
          <CloudOff size={16} aria-hidden="true" />
          <span>
            Couldn't reach the flag service, so every feature is OFF. {state.error}
          </span>
        </p>
      )}
      {state.status === "stale" && (
        <p className="flash warn" role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>The flag service is unreachable; showing the last known flags.</span>
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
