import type { Env, FlagResult } from "./api";
import { explain } from "./explain";
import type { LiveStatus } from "./useLiveUpdates";

interface DebugPanelProps {
  flags: Record<string, FlagResult>;
  env: Env;
  user: string;
  updating: boolean;
  live: LiveStatus;
  resolvedInMs: number;
}

const LIVE_LABELS: Record<LiveStatus, string> = {
  connecting: "connecting…",
  live: "live updates on",
  reconnecting: "reconnecting… (showing last results)",
};

export function DebugPanel({ flags, env, user, updating, live, resolvedInMs }: DebugPanelProps) {
  const keys = Object.keys(flags).sort();
  return (
    <aside className={updating ? "debug updating" : "debug"} aria-label="Flag debug panel">
      <h2>Debug panel</h2>
      <p className="muted">
        {user} · {env}
        {updating ? " · updating…" : ""}
      </p>
      <table>
        <thead>
          <tr>
            <th>Flag</th>
            <th>Value</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const result = flags[key];
            return (
              <tr key={key} data-flag={key}>
                <td>
                  <code>{key}</code>
                </td>
                <td>
                  <span className={result?.value ? "pill on" : "pill off"}>{result?.value ? "ON" : "OFF"}</span>
                </td>
                <td>{explain(result, env)}</td>
              </tr>
            );
          })}
          {keys.length === 0 && (
            <tr>
              <td colSpan={3}>No flags loaded.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted small">
        <span className={`live-dot ${live}`} aria-hidden="true" /> {LIVE_LABELS[live]}
      </p>
      <p className="muted small">First flags resolved before first render ({resolvedInMs} ms).</p>
    </aside>
  );
}
