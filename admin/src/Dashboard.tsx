import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Me } from "./api";
import { FlagDetail } from "./FlagDetail";
import { FlagTable } from "./FlagTable";
import { NewFlagForm } from "./NewFlagForm";
import { environmentsQuery, flagsQuery, switchSession } from "./queries";

export function Dashboard({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const environments = useQuery(environmentsQuery);
  const flags = useQuery(flagsQuery);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => switchSession(queryClient, null),
  });

  const selectedFlag = flags.data?.find((f) => f.key === selected);

  return (
    <div className="app">
      <header className="topbar">
        <strong>Feature flags</strong>
        <span className="muted">Admin dashboard</span>
        <span className="spacer" />
        <span className="who">
          {me.username} <span className={`role ${me.role.toLowerCase()}`}>{me.role.toLowerCase()}</span>
        </span>
        <button type="button" onClick={() => logout.mutate()}>
          Log out
        </button>
      </header>

      <div className="layout">
        <section className="card">
          <div className="section-head">
            <h2>Flags</h2>
            {me.can.createFlag && !creating && (
              <button type="button" className="primary" onClick={() => setCreating(true)}>
                + New flag
              </button>
            )}
          </div>
          {creating && (
            <NewFlagForm
              onDone={(key) => {
                setCreating(false);
                if (key) setSelected(key);
              }}
            />
          )}
          {flags.isPending || environments.isPending ? (
            <p className="muted">Loading flags…</p>
          ) : flags.isError ? (
            <p className="error">Couldn't load flags: {flags.error.message}</p>
          ) : (
            <FlagTable
              flags={flags.data}
              environments={environments.data ?? []}
              can={me.can}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          <p className="muted small">
            Toggle a flag per environment; click a row to edit its rules.
            {me.can.changeEnvironments.length === 0 && " Your role is read-only."}
            {me.can.changeEnvironments.length > 0 &&
              me.can.changeEnvironments.length < (environments.data?.length ?? 0) &&
              ` You can change ${me.can.changeEnvironments.join(", ")} only.`}
          </p>
        </section>

        {selectedFlag ? (
          <FlagDetail
            key={selectedFlag.key}
            flag={selectedFlag}
            environments={environments.data ?? []}
            can={me.can}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <section className="card placeholder muted">Select a flag to see its rules and history.</section>
        )}
      </div>
    </div>
  );
}
