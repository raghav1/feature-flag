import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Env, FlagResult } from "./api";
import { DebugPanel } from "./DebugPanel";
import { flagsQuery } from "./queries";
import { Storefront } from "./Storefront";
import { DEMO_USERS, label, toSearch, type Selection } from "./users";

interface AppProps {
  initialSelection: Selection;
  resolvedInMs: number;
}

export function App({ initialSelection, resolvedInMs }: AppProps) {
  const [selection, setSelection] = useState(initialSelection);
  // keepPreviousData: while a new user's flags load, keep showing the last complete set, then swap all at once.
  const query = useQuery({ ...flagsQuery(selection), placeholderData: keepPreviousData });
  const flags: Record<string, FlagResult> = query.data?.flags ?? {};
  const isOn = (key: string) => flags[key]?.value === true;
  const updating = query.isPlaceholderData || query.isFetching;

  function select(next: Selection) {
    setSelection(next);
    window.history.replaceState(null, "", toSearch(next));
  }

  return (
    <div className={isOn("dark-mode") ? "page dark" : "page"}>
      <header className="topbar">
        <strong className="brand">Corner Shop</strong>
        <span className="tag">demo storefront</span>
        <div className="controls">
          <label>
            Viewing as{" "}
            <select
              value={selection.user.key}
              onChange={(e) => {
                const user = DEMO_USERS.find((u) => u.key === e.target.value);
                if (user) select({ ...selection, user });
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
            <select value={selection.env} onChange={(e) => select({ ...selection, env: e.target.value as Env })}>
              <option value="prod">prod</option>
              <option value="dev">dev</option>
            </select>
          </label>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
            Refresh
          </button>
        </div>
      </header>

      {query.isError && !query.data && (
        <p className="banner" role="alert">
          Couldn't reach the flag service, so every feature is OFF. {query.error.message}
        </p>
      )}

      <div className="layout">
        <Storefront
          isOn={isOn}
          customer={selection.user.customer}
          name={selection.user.userId ? selection.user.name : undefined}
        />
        <DebugPanel
          flags={flags}
          env={selection.env}
          user={label(selection.user)}
          updating={updating}
          resolvedInMs={resolvedInMs}
        />
      </div>
    </div>
  );
}
