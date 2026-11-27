import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type EnvironmentState, type Rule } from "./api";
import { ArrowDown, ArrowUp, Building2, Globe, PieChart, Plus, Tag, Trash2, Users, type LucideIcon } from "lucide-react";
import { IdListInput } from "./IdListInput";
import { refreshFlag } from "./queries";
import { RULE_LABELS, draftProblems, fromDraft, hasRejectedText, move, newDraft, toDraft, type DraftRule } from "./rules";

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
  // Done during render when a new server state arrives (React's "adjusting state when a prop changes"), not in
  // an effect: no extra commit showing stale drafts, and no effect used for render logic.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (!dirty) {
      setBase({ rules: state.rules, otherwise: state.otherwise, version: state.version });
      setDrafts(state.rules.map(toDraft));
      setOtherwise(state.otherwise);
    } else if (!conflict && state.version !== base.version) {
      setBase((b) => ({ ...b, version: state.version }));
    }
  }

  /** Our copy may be stale (a conflict, or a reload): fetch the flag and its history again. */
  const refetchFlags = () => refreshFlag(queryClient, flagKey);

  /** Drop local edits. Also refetches, because after a conflict the cached state is stale; with no edits left,
   *  the sync above adopts whatever the server now has. */
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

      <p className="muted small rules-intro">Checked top to bottom. The first rule that matches decides.</p>
      <ol className="rule-list">
        {drafts.map((rule, i) => {
          const Icon = RULE_ICONS[rule.type];
          const problem = problems.get(i);
          return (
            <li key={i} className={`rule-card rule-${rule.type}`}>
              <div className="rule-head">
                <span className={`rule-icon ${rule.type}`} aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="rule-title">
                  <span className="muted">{i === 0 ? "If" : "Else if"}</span> <strong>{RULE_LABELS[rule.type]}</strong>
                </span>
                <span className="spacer" />
                <ServeToggle
                  value={rule.serve}
                  disabled={!canEdit}
                  label={`Rule ${i + 1} serves`}
                  onChange={(serve) => update(i, { ...rule, serve })}
                />
                {canEdit && (
                  <span className="rule-actions">
                    <button type="button" className="icon-button" aria-label={`Move rule ${i + 1} up`} disabled={i === 0}
                      onClick={() => setDrafts((d) => move(d, i, i - 1))}>
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" className="icon-button" aria-label={`Move rule ${i + 1} down`} disabled={i === drafts.length - 1}
                      onClick={() => setDrafts((d) => move(d, i, i + 1))}>
                      <ArrowDown size={15} />
                    </button>
                    <button type="button" className="icon-button danger-hover" aria-label={`Remove rule ${i + 1}`}
                      onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </span>
                )}
              </div>
              <div className="rule-body">
                {rule.type === "percent" ? (
                  <div className="percent">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={rule.percent}
                      disabled={!canEdit}
                      aria-label={`Rule ${i + 1} percentage`}
                      onChange={(e) => update(i, { ...rule, percent: Number(e.target.value) })}
                    />
                    <span className="percent-value">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={rule.percent}
                        disabled={!canEdit}
                        aria-label={`Rule ${i + 1} percentage value`}
                        onChange={(e) => update(i, { ...rule, percent: Number(e.target.value) })}
                      />
                      % of users
                    </span>
                  </div>
                ) : rule.type === "attribute" ? (
                  <div className="attribute-rule">
                    <span className="attribute-rule-head">
                      <input
                        value={rule.attribute}
                        disabled={!canEdit}
                        aria-label={`Rule ${i + 1} attribute name`}
                        placeholder="Attribute, e.g. country"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                        autoCorrect="off"
                        onChange={(e) => update(i, { ...rule, attribute: e.target.value })}
                      />
                      <select
                        value={rule.operator}
                        disabled={!canEdit}
                        aria-label={`Rule ${i + 1} operator`}
                        onChange={(e) => update(i, { ...rule, operator: e.target.value === "not_in" ? "not_in" : "in" })}
                      >
                        <option value="in">is one of</option>
                        <option value="not_in">is not one of</option>
                      </select>
                    </span>
                    <IdListInput
                      ids={rule.ids}
                      pending={rule.pending}
                      onChange={(ids, pending) => update(i, { ...rule, ids, pending })}
                      disabled={!canEdit}
                      label={`Rule ${i + 1} values`}
                      placeholder="Type a value, e.g. US"
                    />
                  </div>
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
                {problem && <p className={`${problem.severity === "hint" ? "muted" : "error"} small rule-problem`}>{problem.message}</p>}
              </div>
            </li>
          );
        })}
        <li className="rule-card otherwise">
          <div className="rule-head">
            <span className="rule-icon otherwise" aria-hidden="true">
              <Globe size={16} />
            </span>
            <span className="rule-title">
              <span className="muted">{drafts.length === 0 ? "Everyone" : "Everyone else"}</span>
            </span>
            <span className="spacer" />
            <ServeToggle value={otherwise} disabled={!canEdit} label="Otherwise serves" onChange={setOtherwise} />
          </div>
        </li>
      </ol>

      {canEdit && (
        <div className="rule-footer">
          <span className="add-rule" role="group" aria-label="Add rule">
            <span className="muted small">Add rule:</span>
            {(["users", "customers", "percent", "attribute"] as const).map((type) => {
              const Icon = RULE_ICONS[type];
              return (
                <button key={type} type="button" className="chip-button" onClick={() => setDrafts((d) => [...d, newDraft(type)])}>
                  <Plus size={13} /> <Icon size={14} /> {RULE_LABELS[type]}
                </button>
              );
            })}
          </span>
          <span className="spacer" />
          {/* Rejected text (e.g. "bad#id") isn't a rule change, but it's still an edit Discard must be able to clear. */}
          <button type="button" disabled={!(dirty || hasRejectedText(drafts)) || save.isPending} onClick={discard}>
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

const RULE_ICONS: Record<DraftRule["type"], LucideIcon> = {
  users: Users,
  customers: Building2,
  percent: PieChart,
  attribute: Tag,
};

/** Two-button ON/OFF control: what this rule (or "everyone else") gets. */
function ServeToggle({ value, disabled, label, onChange }: { value: boolean; disabled: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <span className="serve" role="radiogroup" aria-label={label}>
      <span className="muted small">gets</span>
      {[true, false].map((on) => (
        <button
          key={String(on)}
          type="button"
          role="radio"
          aria-checked={value === on}
          disabled={disabled}
          className={value === on ? `serve-option selected ${on ? "on" : "off"}` : "serve-option"}
          onClick={() => onChange(on)}
        >
          {on ? "ON" : "OFF"}
        </button>
      ))}
    </span>
  );
}
