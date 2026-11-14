import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FilePlus2, ListChecks, Pencil, Power, PowerOff, Search, Trash2, type LucideIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { api, type AuditAction, type AuditEvent, type AuditSearch } from "./api";
import { Avatar } from "./Activity";
import { CHANGE_LABELS, changeKind, groupByDay, highlight, type ChangeKind } from "./activityLog";
import { ago } from "./format";
import { environmentsQuery, keys } from "./queries";

const PAGE_SIZE = 50;

const KIND_ICONS: Record<ChangeKind, LucideIcon> = {
  on: Power,
  off: PowerOff,
  rules: ListChecks,
  created: FilePlus2,
  deleted: Trash2,
  description: Pencil,
};

const ACTIONS: { value: AuditAction | ""; label: string }[] = [
  { value: "", label: "All changes" },
  { value: "FLAG_TOGGLED", label: "Turned on or off" },
  { value: "RULES_UPDATED", label: "Rules changed" },
  { value: "FLAG_CREATED", label: "Flags created" },
  { value: "FLAG_DELETED", label: "Flags deleted" },
  { value: "FLAG_UPDATED", label: "Descriptions edited" },
];

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/** The whole audit trail: every change to every flag, searchable and filterable, newest first. */
export function ActivityPage({ onOpenFlag }: { onOpenFlag: (flagKey: string, env: string | null) => void }) {
  const environments = useQuery(environmentsQuery);
  const [text, setText] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [env, setEnv] = useState("");
  const [actor, setActor] = useState<"" | "person" | "key">("");
  const q = useDeferredValue(text.trim());

  const filters: AuditSearch = {
    ...(q ? { q } : {}),
    ...(action ? { action } : {}),
    ...(env ? { env } : {}),
    ...(actor ? { actor } : {}),
  };
  const active = Object.keys(filters).length > 0;

  // Under keys.activity, so any flag change (which invalidates that prefix) refreshes this list too.
  const trail = useInfiniteQuery({
    queryKey: [...keys.activity, "search", filters],
    queryFn: ({ pageParam }) => api.searchAudit({ ...filters, limit: PAGE_SIZE, ...(pageParam ? { before: pageParam } : {}) }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page: AuditEvent[]) => (page.length === PAGE_SIZE ? page.at(-1)?.id : undefined),
  });
  const events = trail.data?.pages.flat() ?? [];

  function clear() {
    setText("");
    setAction("");
    setEnv("");
    setActor("");
  }

  return (
    <div className="activity-page">
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="muted">Every change to every flag, newest first: who did it, where, and what changed.</p>
        </div>
      </div>

      <div className="toolbar">
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search changes, flags or people"
            aria-label="Search activity"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <select aria-label="What changed" value={action} onChange={(e) => setAction(e.target.value as AuditAction | "")}>
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <select aria-label="Environment" value={env} onChange={(e) => setEnv(e.target.value)}>
          <option value="">All environments</option>
          {(environments.data ?? []).map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}
            </option>
          ))}
        </select>
        <select aria-label="Who" value={actor} onChange={(e) => setActor(e.target.value as "" | "person" | "key")}>
          <option value="">Everyone</option>
          <option value="person">People</option>
          <option value="key">Agents (API keys)</option>
        </select>
        {active && (
          <button type="button" className="link-button" onClick={clear}>
            Clear filters
          </button>
        )}
      </div>

      {trail.isPending ? (
        <p className="muted">Loading activity…</p>
      ) : trail.isError ? (
        <p className="error">Couldn't load activity: {trail.error.message}</p>
      ) : events.length === 0 ? (
        <div className="empty">{active ? "No changes match these filters." : "Nothing has changed yet."}</div>
      ) : (
        <>
          {groupByDay(events).map((group) => (
            <section key={group.label} className="day" aria-label={group.label}>
              <h2 className="day-label">{group.label}</h2>
              <ol className="trail">
                {group.events.map((e) => {
                  const kind = changeKind(e);
                  const Icon = KIND_ICONS[kind];
                  return (
                    <li key={e.id} className="trail-item">
                      <span className={`change-icon ${kind}`} title={CHANGE_LABELS[kind]} aria-hidden="true">
                        <Icon size={15} />
                      </span>
                      <div className="trail-main">
                        <div className="trail-summary">
                          <span className="sr-only">{CHANGE_LABELS[kind]}: </span>
                          <Highlighted text={e.summary} query={q} />
                        </div>
                        <div className="trail-meta">
                          {kind === "deleted" ? (
                            <code className="flag-link deleted">
                              <Highlighted text={e.flagKey} query={q} />
                            </code>
                          ) : (
                            <button
                              type="button"
                              className="flag-link"
                              title={`Open ${e.flagKey}`}
                              onClick={() => onOpenFlag(e.flagKey, e.envKey)}
                            >
                              <Highlighted text={e.flagKey} query={q} />
                            </button>
                          )}
                          {e.envKey && <span className={`env-tag ${e.envKey}`}>{e.envKey}</span>}
                          <span className="trail-actor">
                            <Avatar actor={e.actor} />
                            <Highlighted text={e.actor} query={q} />
                          </span>
                        </div>
                      </div>
                      <time className="trail-time muted small" dateTime={e.at} title={new Date(e.at).toLocaleString()}>
                        {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        <br />
                        {ago(e.at)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          <div className="trail-footer">
            <span className="muted small">
              Showing {events.length} change{events.length === 1 ? "" : "s"}
              {trail.hasNextPage ? "" : active ? " (all matches)" : " (everything)"}
            </span>
            {trail.hasNextPage && (
              <button type="button" disabled={trail.isFetchingNextPage} onClick={() => void trail.fetchNextPage()}>
                {trail.isFetchingNextPage ? "Loading…" : "Load older"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
