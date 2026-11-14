import { useQuery } from "@tanstack/react-query";
import { ago } from "./format";
import { auditQuery } from "./queries";

export function AuditList({ flagKey }: { flagKey: string }) {
  const audit = useQuery(auditQuery(flagKey));

  return (
    <div className="audit">
      <h3>History</h3>
      {audit.isPending && <p className="muted small">Loading…</p>}
      {audit.isError && <p className="error small">{audit.error.message}</p>}
      {audit.data?.length === 0 && <p className="muted small">No changes recorded yet.</p>}
      <ul>
        {audit.data?.map((e) => (
          <li key={e.id}>
            <strong>{e.actor}</strong>
            <span className="muted"> · {e.envKey ?? "flag"} · </span>
            {e.summary}
            <span className="muted" title={new Date(e.at).toLocaleString()}>
              {" "}
              · {ago(e.at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
