import { ChevronDown, Users } from "lucide-react";
import type { AuditEvent, Environment, Flag, Permissions } from "./api";
import { audienceSentence, envStatus } from "./audience";
import { Avatar } from "./Activity";
import { EnvSwitch } from "./EnvSwitch";
import { FlagDetails } from "./FlagDetails";
import { ago } from "./format";
import { StatusBadge } from "./StatusBadge";

interface FlagRowProps {
  flag: Flag;
  environments: Environment[];
  /** The environment the row summarises (prod: what real users get). */
  primaryEnv: string;
  can: Permissions;
  lastChange: AuditEvent | undefined;
  expanded: boolean;
  detailEnv: string;
  onToggle: () => void;
  onEnvChange: (env: string) => void;
  onDeleted: () => void;
}

/**
 * One flag. Collapsed, it answers "is it live, and for whom?" at a glance; the switches allow a quick toggle.
 * Expanded, it shows everything about the flag.
 */
export function FlagRow(props: FlagRowProps) {
  const { flag, environments, primaryEnv, can, lastChange, expanded, onToggle } = props;
  const primary = flag.environments[primaryEnv];

  return (
    <li className={expanded ? "flag-row expanded" : "flag-row"}>
      <div
        className="flag-summary"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${flag.key}, ${expanded ? "collapse" : "expand"}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="flag-status">{primary && <StatusBadge status={envStatus(primary)} suffix={`in ${primaryEnv}`} />}</div>
        <div className="flag-main">
          <div className="flag-name">{flag.key}</div>
          {flag.description && <div className="flag-desc">{flag.description}</div>}
          {primary && (
            <div className="flag-audience">
              <Users size={13} aria-hidden="true" /> {audienceSentence(primary)}
            </div>
          )}
        </div>
        <div className="flag-envs" onClick={(e) => e.stopPropagation()}>
          {environments.map((env) => {
            const state = flag.environments[env.key];
            return state ? (
              <EnvSwitch
                key={env.key}
                flag={flag}
                envKey={env.key}
                state={state}
                canChange={can.changeEnvironments.includes(env.key)}
                label={env.key}
              />
            ) : null;
          })}
        </div>
        <div className="flag-meta">
          {lastChange ? (
            <>
              <Avatar actor={lastChange.actor} />
              <span>
                {lastChange.actor}
                <br />
                <span className="muted">{ago(lastChange.at)}</span>
              </span>
            </>
          ) : (
            <span className="muted">Created {ago(flag.createdAt)}</span>
          )}
        </div>
        <ChevronDown className="chevron" size={20} aria-hidden="true" />
      </div>
      {expanded && (
        <FlagDetails
          flag={flag}
          environments={environments}
          can={can}
          env={props.detailEnv}
          onEnvChange={props.onEnvChange}
          onDeleted={props.onDeleted}
        />
      )}
    </li>
  );
}
