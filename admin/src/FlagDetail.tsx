import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Environment, type Flag, type Permissions } from "./api";
import { AuditList } from "./AuditList";
import { keys } from "./queries";
import { RuleEditor } from "./RuleEditor";

interface FlagDetailProps {
  flag: Flag;
  environments: Environment[];
  can: Permissions;
  onDeleted: () => void;
}

export function FlagDetail({ flag, environments, can, onDeleted }: FlagDetailProps) {
  const queryClient = useQueryClient();
  const [env, setEnv] = useState(() => (environments.some((e) => e.key === "prod") ? "prod" : (environments[0]?.key ?? "")));
  const [description, setDescription] = useState(flag.description);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.flags });
    void queryClient.invalidateQueries({ queryKey: keys.audit(flag.key) });
  };
  const saveDescription = useMutation({ mutationFn: () => api.updateDescription(flag.key, description.trim()), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api.deleteFlag(flag.key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.flags });
      onDeleted();
    },
  });

  const state = flag.environments[env];
  const canEditEnv = can.changeEnvironments.includes(env);

  return (
    <section className="card detail" aria-label={`${flag.key} details`}>
      <div className="section-head">
        <h2 className="flag-key">{flag.key}</h2>
        {can.deleteFlag && !confirmingDelete && (
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div className="confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete <code>{flag.key}</code> in every environment? Code that checks it will get OFF. Its history stays in the
            audit log.
          </p>
          {remove.isError && <p className="error">{remove.error.message}</p>}
          <div className="row">
            <button type="button" className="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Delete flag
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {can.editDescription ? (
        <div className="row description">
          <input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          {description.trim() !== flag.description && (
            <button type="button" disabled={saveDescription.isPending} onClick={() => saveDescription.mutate()}>
              Save
            </button>
          )}
        </div>
      ) : (
        <p className="muted">{flag.description || "No description"}</p>
      )}
      {saveDescription.isError && <p className="error">{saveDescription.error.message}</p>}

      <div className="tabs" role="tablist">
        {environments.map((e) => (
          <button
            key={e.key}
            type="button"
            role="tab"
            aria-selected={e.key === env}
            className={e.key === env ? "tab active" : "tab"}
            onClick={() => setEnv(e.key)}
          >
            {e.key}
            <span className={flag.environments[e.key]?.enabled ? "dot on" : "dot"} />
          </button>
        ))}
      </div>

      {state && (
        <>
          <p className="muted small">
            {flag.key} is <strong>{state.enabled ? "ON" : "OFF"}</strong> in {env}
            {state.enabled ? ". Rules apply, first match wins." : ", so everyone gets OFF. Rules apply once it's turned ON."}
          </p>
          <RuleEditor key={`${flag.key}:${env}`} flagKey={flag.key} env={env} state={state} canEdit={canEditEnv} />
        </>
      )}

      <AuditList flagKey={flag.key} />
    </section>
  );
}
