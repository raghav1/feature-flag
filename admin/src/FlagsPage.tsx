import { useQuery } from "@tanstack/react-query";
import { Flag, Info, Plus, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import type { AuditEvent, Me } from "./api";
import { envStatus, type EnvStatus } from "./audience";
import { Blankslate } from "./Blankslate";
import { FlagRow } from "./FlagRow";
import { NewFlagForm } from "./NewFlagForm";
import { activityQuery, environmentsQuery, flagsQuery } from "./queries";

type Filter = "all" | EnvStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "partial", label: "Partial" },
  { value: "off", label: "Off" },
];

/** ?flag=&env= keeps the expanded flag across reloads and in shared links. */
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  return { flag: params.get("flag"), env: params.get("env") };
}

function writeUrl(flag: string | null, env: string | null) {
  const params = new URLSearchParams();
  if (flag) params.set("flag", flag);
  if (flag && env) params.set("env", env);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

export function FlagsPage({ me }: { me: Me }) {
  const flags = useQuery(flagsQuery);
  const environments = useQuery(environmentsQuery);
  const activity = useQuery(activityQuery);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(() => readUrl().flag);
  const [detailEnv, setDetailEnv] = useState<string | null>(() => readUrl().env);

  const envs = environments.data ?? [];
  // The row summary shows what real users get: prod if there is one, else the last environment.
  const primaryEnv = envs.some((e) => e.key === "prod") ? "prod" : (envs.at(-1)?.key ?? "prod");

  const lastChangeByFlag = useMemo(() => {
    const latest = new Map<string, AuditEvent>();
    for (const event of activity.data ?? []) {
      if (!latest.has(event.flagKey)) latest.set(event.flagKey, event);
    }
    return latest;
  }, [activity.data]);

  const all = flags.data ?? [];
  const statusOf = (key: string) => {
    const state = all.find((f) => f.key === key)?.environments[primaryEnv];
    return state ? envStatus(state) : "off";
  };
  const needle = search.trim().toLowerCase();
  const visible = all.filter(
    (f) =>
      (filter === "all" || statusOf(f.key) === filter) &&
      (!needle || f.key.includes(needle) || f.description.toLowerCase().includes(needle)),
  );
  const count = (value: Filter) => (value === "all" ? all.length : all.filter((f) => statusOf(f.key) === value).length);

  function expand(key: string | null, env: string | null = null) {
    const nextEnv = key ? (env ?? (key === expanded ? detailEnv : null) ?? primaryEnv) : null;
    setExpanded(key);
    setDetailEnv(nextEnv);
    writeUrl(key, nextEnv);
  }

  const readOnlyEnvs = envs.filter((e) => !me.can.changeEnvironments.includes(e.key)).map((e) => e.key);

  return (
    <main className="flags-page">
      <div className="page-head">
        <div>
          <h1>Feature flags</h1>
          <p className="muted">Turn features on, roll them out gradually, and see who changed what.</p>
        </div>
        {me.can.createFlag && !creating && (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> New flag
          </button>
        )}
      </div>

      {readOnlyEnvs.length > 0 && (
        <p className="note">
          <Info size={14} aria-hidden="true" />{" "}
          {readOnlyEnvs.length === envs.length
            ? "Your role is read-only: you can see everything but not change it."
            : `As ${me.role.toLowerCase()}, you can change ${me.can.changeEnvironments.join(", ")}; ${readOnlyEnvs.join(", ")} is read-only.`}
        </p>
      )}

      {creating && (
        <NewFlagForm
          onDone={(key) => {
            setCreating(false);
            if (key) expand(key, envs[0]?.key ?? null);
          }}
        />
      )}

      <div className="toolbar">
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search flags"
            aria-label="Search flags"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filters" role="group" aria-label={`Filter by status in ${primaryEnv}`}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              className={filter === f.value ? `filter selected ${f.value}` : `filter ${f.value}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label} <span className="count">{count(f.value)}</span>
            </button>
          ))}
          <span className="muted small">in {primaryEnv}</span>
        </div>
      </div>

      {flags.isPending || environments.isPending ? (
        <p className="muted">Loading flags…</p>
      ) : flags.isError ? (
        <p className="error">Couldn't load flags: {flags.error.message}</p>
      ) : visible.length === 0 ? (
        all.length === 0 ? (
          <Blankslate icon={Flag} title="No flags yet">
            {me.can.createFlag ? "Create a flag to ship a feature dark, then turn it on for the people you choose." : "When someone creates a flag, it shows up here."}
          </Blankslate>
        ) : (
          <Blankslate icon={SearchX} title="No flags match">
            Try a different search, or pick All.
          </Blankslate>
        )
      ) : (
        <ul className="flag-list">
          {visible.map((flag) => (
            <FlagRow
              key={flag.key}
              flag={flag}
              environments={envs}
              primaryEnv={primaryEnv}
              can={me.can}
              lastChange={lastChangeByFlag.get(flag.key)}
              expanded={expanded === flag.key}
              detailEnv={(expanded === flag.key && detailEnv) || primaryEnv}
              onToggle={() => expand(expanded === flag.key ? null : flag.key)}
              onEnvChange={(env) => expand(flag.key, env)}
              onDeleted={() => expand(null)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
