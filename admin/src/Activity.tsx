import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { ago } from "./format";
import { auditQuery } from "./queries";

/** "ad" for admin; API keys get a key icon instead of initials. */
export function Avatar({ actor }: { actor: string }) {
  if (actor.startsWith("key:")) {
    return (
      <span className="avatar key" title="API key">
        <KeyRound size={12} aria-hidden="true" />
      </span>
    );
  }
  return <span className="avatar">{actor.slice(0, 2).toUpperCase()}</span>;
}

/** A flag's history as a timeline, newest first; the latest few, with the rest one click away. */
export function Activity({ flagKey }: { flagKey: string }) {
  const audit = useQuery(auditQuery(flagKey));
  const [showAll, setShowAll] = useState(false);
  const events = audit.data ?? [];
  const shown = showAll ? events : events.slice(0, 5);

  return (
    <div className="activity">
      {audit.isPending && <p className="muted small">Loading…</p>}
      {audit.isError && <p className="error small">{audit.error.message}</p>}
      {audit.data?.length === 0 && <p className="muted small">No changes yet.</p>}
      <ol className="timeline">
        {shown.map((e) => (
          <li key={e.id}>
            <Avatar actor={e.actor} />
            <div>
              <div className="timeline-summary">{e.summary}</div>
              <div className="muted small">
                <strong>{e.actor}</strong>
                {e.envKey && <span className={`env-tag ${e.envKey}`}>{e.envKey}</span>}
                <span title={new Date(e.at).toLocaleString()}> · {ago(e.at)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {events.length > 5 && (
        <button type="button" className="link-button" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show less" : `Show all ${events.length} changes`}
        </button>
      )}
    </div>
  );
}
