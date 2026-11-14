import type { CacheStatus, FlagResult, LiveStatus } from "@flags/sdk";
import {
  Ban,
  Bug,
  CircleHelp,
  CornerDownRight,
  ListChecks,
  Radio,
  ToggleLeft,
  ToggleRight,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Env } from "./api";
import { explain } from "./explain";

interface DebugPanelProps {
  flags: Record<string, FlagResult>;
  env: Env;
  user: string;
  updating: boolean;
  live: LiveStatus;
  cache: CacheStatus;
  resolvedInMs: number;
}

const LIVE_LABELS: Record<LiveStatus, string> = {
  off: "Live updates off",
  connecting: "Connecting…",
  live: "Live updates on",
  reconnecting: "Reconnecting…",
};

const CACHE_LABELS: Record<CacheStatus, string> = {
  loading: "loading",
  fresh: "results are current",
  stale: "showing last known results (flag service unreachable)",
  unavailable: "no results (flag service unreachable)",
};

const REASON_ICONS: Record<FlagResult["reason"], LucideIcon> = {
  FLAG_OFF: Ban,
  RULE_MATCH: ListChecks,
  OTHERWISE: CornerDownRight,
  FLAG_NOT_FOUND: CircleHelp,
};

export function DebugPanel({ flags, env, user, updating, live, cache, resolvedInMs }: DebugPanelProps) {
  const keys = Object.keys(flags).sort();
  return (
    <aside className={updating ? "box debug updating" : "box debug"} aria-label="Flag debug panel">
      <div className="debug-head">
        <Bug size={16} aria-hidden="true" />
        <h2>Debug panel</h2>
        <span className={`label env-label ${env}`}>{env}</span>
      </div>
      <p className="debug-sub muted small">
        {user}
        {updating ? " · updating…" : ""}
      </p>

      <ul className="debug-list" aria-label="Flag values">
        {keys.map((key) => {
          const result = flags[key];
          const on = result?.value === true;
          const ReasonIcon = result ? REASON_ICONS[result.reason] : CircleHelp;
          return (
            <li key={key} className="debug-row" data-flag={key}>
              <div className="debug-row-top">
                <code>{key}</code>
                <span className={on ? "state on" : "state off"}>
                  {on ? <ToggleRight size={14} aria-hidden="true" /> : <ToggleLeft size={14} aria-hidden="true" />}
                  {on ? "ON" : "OFF"}
                </span>
              </div>
              <p className="why muted small">
                <ReasonIcon size={13} aria-hidden="true" />
                <span>{explain(result, env)}</span>
              </p>
            </li>
          );
        })}
        {keys.length === 0 && <li className="debug-row muted">No flags loaded.</li>}
      </ul>

      <div className="debug-foot muted small">
        <p>
          <Radio size={13} aria-hidden="true" className={`live-icon ${live}`} />
          <span>
            {LIVE_LABELS[live]} · {CACHE_LABELS[cache]}
          </span>
        </p>
        <p>
          <Zap size={13} aria-hidden="true" />
          <span>First flags resolved before first render ({resolvedInMs} ms).</span>
        </p>
      </div>
    </aside>
  );
}
