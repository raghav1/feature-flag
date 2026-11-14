import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError, type EnvironmentState, type Rule } from "./api";
import { IdListInput } from "./IdListInput";
import { keys } from "./queries";
import { RULE_LABELS, draftProblems, fromDraft, move, newDraft, toDraft, type DraftRule } from "./rules";

interface RuleEditorProps {
  flagKey: string;
  env: string;
  state: EnvironmentState;
  canEdit: boolean;
}

/** The server state this draft started from. */
interface Base {
  rules: Rule[];
  otherwise: boolean;
  version: number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function RuleEditor({ flagKey, env, state, canEdit }: RuleEditorProps) {
  const queryClient = useQueryClient();
  const [base, setBase] = useState<Base>({ rules: state.rules, otherwise: state.otherwise, version: state.version });
  const [drafts, setDrafts] = useState<DraftRule[]>(() => state.rules.map(toDraft));
  const [otherwise, setOtherwise] = useState(state.otherwise);

  const dirty = !same(drafts.map(fromDraft), base.rules) || otherwise !== base.otherwise;
  const conflict = !same(state.rules, base.rules) || state.otherwise !== base.otherwise;

  // Follow the server: take its state when we have no edits; when only the version moved (e.g. someone toggled
  // the flag), rebase silently so saving doesn't fail for a change that doesn't touch the rules.
  useEffect(() => {
    if (!dirty) {
      setBase({ rules: state.rules, otherwise: state.otherwise, version: state.version });
      setDrafts(state.rules.map(toDraft));
      setOtherwise(state.otherwise);
    } else if (!conflict && state.version !== base.version) {
      setBase((b) => ({ ...b, version: state.version }));
    }
    // Deliberately keyed on the server state only, not on local edits.
  }, [state]);

  /** Our copy may be stale (a conflict, or a reload): fetch the flag and its history again. */
  const refetchFlags = () => {
    void queryClient.invalidateQueries({ queryKey: keys.flags });
    void queryClient.invalidateQueries({ queryKey: keys.audit(flagKey) });
  };

  /** Drop local edits. Also refetches, because after a conflict the cached state is stale; with no edits left,
   *  the effect above adopts whatever the server now has. */
  const discard = () => {
    setBase({ rules: state.rules, otherwise: state.otherwise, version: state.version });
    setDrafts(state.rules.map(toDraft));
    setOtherwise(state.otherwise);
    save.reset();
    refetchFlags();
  };

  const save = useMutation({
    mutationFn: () => api.setRules(flagKey, env, drafts.map(fromDraft), otherwise, base.version),
    onSuccess: (saved) => {
      setBase({ rules: saved.rules, otherwise: saved.otherwise, version: saved.version });
      setDrafts(saved.rules.map(toDraft));
      setOtherwise(saved.otherwise);
      refetchFlags();
    },
    // A 409 means our copy is stale: refetch so the conflict warning shows what changed.
    onError: refetchFlags,
  });

  const problems = draftProblems(drafts);
  const update = (i: number, next: DraftRule) => setDrafts((d) => d.map((r, j) => (j === i ? next : r)));
  const serverErrors = save.error instanceof ApiError ? save.error.fieldErrors : [];

  return (
    <div className="rules" aria-label={`Rules for ${env}`}>
      {!canEdit && <p className="muted small">Read-only: your role can't change {env}.</p>}
      {canEdit && conflict && dirty && (
        <p className="error" role="alert">
          Someone else changed these rules while you were editing.{" "}
          <button type="button" onClick={discard}>
            Discard my changes
          </button>
        </p>
      )}

      <ol className="rule-list">
        {drafts.map((rule, i) => (
          <li key={i} className="rule">
            <span className="num">{i + 1}.</span>
            <span className="rule-label">{RULE_LABELS[rule.type]}</span>
            {rule.type === "percent" ? (
              <span className="percent">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={rule.percent}
                  disabled={!canEdit}
                  aria-label={`Rule ${i + 1} percentage`}
                  onChange={(e) => update(i, { ...rule, percent: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={rule.percent}
                  disabled={!canEdit}
                  aria-label={`Rule ${i + 1} percentage value`}
                  onChange={(e) => update(i, { ...rule, percent: Number(e.target.value) })}
                />
                %
              </span>
            ) : (
              <IdListInput
                kind={rule.type === "users" ? "user" : "customer"}
                ids={rule.ids}
                pending={rule.pending}
                onChange={(ids, pending) => update(i, { ...rule, ids, pending })}
                disabled={!canEdit}
                label={`Rule ${i + 1} ${rule.type === "users" ? "user IDs" : "customers"}`}
                placeholder={rule.type === "users" ? "Type a user ID, e.g. u_102" : "Type a customer, e.g. acme"}
              />
            )}
            <span className="arrow">→</span>
            <select
              value={rule.serve ? "on" : "off"}
              disabled={!canEdit}
              aria-label={`Rule ${i + 1} serves`}
              onChange={(e) => update(i, { ...rule, serve: e.target.value === "on" })}
            >
              <option value="on">ON</option>
              <option value="off">OFF</option>
            </select>
            {canEdit && (
              <span className="rule-actions">
                <button type="button" aria-label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => setDrafts((d) => move(d, i, i - 1))}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move rule ${i + 1} down`}
                  disabled={i === drafts.length - 1}
                  onClick={() => setDrafts((d) => move(d, i, i + 1))}
                >
                  ↓
                </button>
                <button type="button" aria-label={`Remove rule ${i + 1}`} onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </span>
            )}
            {problems.has(i) && (
              <span className={`${problems.get(i)?.severity === "hint" ? "muted" : "error"} small rule-problem`}>
                {problems.get(i)?.message}
              </span>
            )}
          </li>
        ))}
        <li className="rule otherwise">
          <span className="num" />
          <span className="rule-label">Otherwise</span>
          <span className="arrow">→</span>
          <select
            value={otherwise ? "on" : "off"}
            disabled={!canEdit}
            aria-label="Otherwise serves"
            onChange={(e) => setOtherwise(e.target.value === "on")}
          >
            <option value="on">ON</option>
            <option value="off">OFF</option>
          </select>
        </li>
      </ol>

      {canEdit && (
        <div className="row">
          <select
            aria-label="Add rule"
            value=""
            onChange={(e) => {
              const type = e.target.value as DraftRule["type"];
              if (type) setDrafts((d) => [...d, newDraft(type)]);
            }}
          >
            <option value="">+ Add rule…</option>
            <option value="users">User ID in…</option>
            <option value="customers">Customer in…</option>
            <option value="percent">Percentage rollout</option>
          </select>
          <span className="spacer" />
          <button type="button" disabled={!dirty || save.isPending} onClick={discard}>
            Discard
          </button>
          <button
            type="button"
            className="primary"
            disabled={!dirty || problems.size > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : `Save ${env} rules`}
          </button>
        </div>
      )}

      {save.isError && (
        <p className="error" role="alert">
          {save.error.message}
          {serverErrors.map((f) => ` ${f.field}: ${f.message}.`).join("")}
          {save.error instanceof ApiError && save.error.status === 409 && (
            <>
              {" "}
              <button type="button" onClick={discard}>
                Reload rules
              </button>
            </>
          )}
        </p>
      )}
      {save.isSuccess && !dirty && <p className="muted small">Saved.</p>}
    </div>
  );
}
