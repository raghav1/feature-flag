import { useMutation, useQueryClient } from "@tanstack/react-query";
import { History, Lock, Pencil, Settings, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { api, type Environment, type Flag, type Permissions } from "./api";
import { Activity } from "./Activity";
import { audienceSentence, envStatus } from "./audience";
import { ConfirmDialog } from "./ConfirmDialog";
import { EnvSwitch } from "./EnvSwitch";
import { ago } from "./format";
import { keys, refreshFlag } from "./queries";
import { RuleEditor } from "./RuleEditor";
import { StatusBadge } from "./StatusBadge";

interface FlagDetailsProps {
  flag: Flag;
  environments: Environment[];
  can: Permissions;
  env: string;
  onEnvChange: (env: string) => void;
  onDeleted: () => void;
}

/** A flag, expanded: where it's on and for whom first, then how (rules), then what happened (activity). */
export function FlagDetails({ flag, environments, can, env, onEnvChange, onDeleted }: FlagDetailsProps) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(flag.description);
  const [editingDescription, setEditingDescription] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const saveDescription = useMutation({
    mutationFn: () => api.updateDescription(flag.key, description.trim()),
    onSuccess: () => {
      setEditingDescription(false);
      refreshFlag(queryClient, flag.key);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteFlag(flag.key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.flags });
      void queryClient.invalidateQueries({ queryKey: keys.activity });
      onDeleted();
    },
  });

  const state = flag.environments[env];
  const envName = environments.find((e) => e.key === env)?.name ?? env;
  const canEditEnv = can.changeEnvironments.includes(env);

  return (
    <div className="flag-details">
      <div className="env-tabs" role="tablist" aria-label="Environment">
        {environments.map((e) => {
          const s = flag.environments[e.key];
          return (
            <button
              key={e.key}
              type="button"
              role="tab"
              aria-selected={e.key === env}
              className={e.key === env ? "env-tab active" : "env-tab"}
              onClick={() => onEnvChange(e.key)}
            >
              <span className="env-tab-name">{e.name}</span>
              {s && <StatusBadge status={envStatus(s)} size="sm" />}
            </button>
          );
        })}
      </div>

      {state && (
        <>
          <section className={`status-card ${envStatus(state)}`} aria-label={`Status in ${envName}`}>
            <div className="status-main">
              <StatusBadge status={envStatus(state)} size="lg" />
              <div>
                <div className="status-sentence">{audienceSentence(state)}</div>
                <div className="muted small">
                  {envName} · last changed {ago(state.updatedAt)}
                </div>
              </div>
            </div>
            <EnvSwitch flag={flag} envKey={env} state={state} canChange={canEditEnv} label={state.enabled ? "On" : "Off"} size="lg" />
          </section>

          {!canEditEnv && (
            <p className="note">
              <Lock size={14} aria-hidden="true" /> You can view {envName.toLowerCase()} but not change it with your role.
            </p>
          )}

          <section className="details-section">
            <h3>
              <Users size={16} aria-hidden="true" /> Who gets it in {envName.toLowerCase()}
            </h3>
            {!state.enabled && (
              <p className="muted small">The flag is off here, so these rules apply only once it's turned on.</p>
            )}
            <RuleEditor key={`${flag.key}:${env}`} flagKey={flag.key} env={env} state={state} canEdit={canEditEnv} />
          </section>
        </>
      )}

      <section className="details-section">
        <h3>
          <History size={16} aria-hidden="true" /> Activity
        </h3>
        <Activity flagKey={flag.key} />
      </section>

      <section className="details-section settings">
        <h3>
          <Settings size={16} aria-hidden="true" /> Settings
        </h3>
        <div className="setting">
          <div className="setting-label">Description</div>
          {editingDescription ? (
            <div className="row">
              <input
                aria-label="Description"
                value={description}
                maxLength={500}
                autoFocus
                onChange={(e) => setDescription(e.target.value)}
              />
              <button type="button" className="primary" disabled={saveDescription.isPending} onClick={() => saveDescription.mutate()}>
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDescription(flag.description);
                  setEditingDescription(false);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="row">
              <span>{flag.description || <span className="muted">No description</span>}</span>
              {can.editDescription && (
                <button type="button" className="icon-button" aria-label="Edit description" onClick={() => setEditingDescription(true)}>
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
          {saveDescription.isError && <p className="error small">{saveDescription.error.message}</p>}
        </div>
        <div className="setting">
          <div className="setting-label">Key</div>
          <code>{flag.key}</code> <span className="muted small">used in code; can't be changed</span>
        </div>
        {can.deleteFlag && (
          <div className="danger-zone">
            <div>
              <strong>Delete this flag</strong>
              <div className="muted small">Removes it from every environment. Code that checks it gets OFF. History is kept.</div>
            </div>
            <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          </div>
        )}
        {remove.isError && <p className="error small">{remove.error.message}</p>}
      </section>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${flag.key}?`}
        confirmLabel="Delete flag"
        danger
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          remove.mutate();
        }}
      >
        <p>It disappears from every environment, and code that checks it will get OFF. This can't be undone, but its history stays in the audit log.</p>
      </ConfirmDialog>
    </div>
  );
}
