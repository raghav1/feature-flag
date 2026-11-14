import { useState } from "react";
import type { EnvironmentState, Flag } from "./api";
import { audienceSentence, envStatus } from "./audience";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToggleFlag } from "./useToggleFlag";

interface EnvSwitchProps {
  flag: Flag;
  envKey: string;
  state: EnvironmentState;
  canChange: boolean;
  /** Shown next to the switch, e.g. "dev". */
  label?: string;
  size?: "sm" | "lg";
}

/** The on/off switch for one environment. Prod asks first, saying in plain words who's affected. */
export function EnvSwitch({ flag, envKey, state, canChange, label, size = "sm" }: EnvSwitchProps) {
  const toggle = useToggleFlag();
  const [asking, setAsking] = useState(false);
  const next = !state.enabled;
  const change = () => toggle.mutate({ key: flag.key, env: envKey, enabled: next, version: state.version });

  return (
    <span className={`env-switch ${size}`}>
      <label className="switch" title={canChange ? undefined : `Your role can't change ${envKey}`}>
        <input
          type="checkbox"
          role="switch"
          aria-label={`${flag.key} in ${envKey}`}
          checked={state.enabled}
          disabled={!canChange || toggle.isPending}
          onChange={() => (envKey === "prod" ? setAsking(true) : change())}
        />
        <span className="track" />
      </label>
      {label && <span className="env-switch-label">{label}</span>}
      {toggle.isError && (
        <span className="error small" role="alert">
          {toggle.error.message}
        </span>
      )}
      {asking && (
      <ConfirmDialog
        open
        title={`Turn ${next ? "on" : "off"} ${flag.key} in prod?`}
        confirmLabel={next ? "Turn on in prod" : "Turn off in prod"}
        danger={!next}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          change();
        }}
      >
        <p>{prodImpact(state, next)}</p>
      </ConfirmDialog>
      )}
    </span>
  );
}

/** What turning the flag on or off in prod will mean for real users, in words. */
export function prodImpact(state: EnvironmentState, turningOn: boolean): string {
  if (!turningOn) {
    return "Everyone in prod loses this feature right away. Its rules are kept, so you can turn it back on.";
  }
  const after = { ...state, enabled: true };
  switch (envStatus(after)) {
    case "live":
      return "Everyone in prod gets this feature right away.";
    case "partial":
      return `Real users start getting it right away: ${audienceSentence(after).replace(/^On for /, "")}.`;
    case "off":
      return "It will be on, but no rule matches anyone yet, so nobody gets it until you add a rule or set Everyone else to ON.";
  }
}
