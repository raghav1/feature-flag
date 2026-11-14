import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError, type CreatedKey, type Role } from "./api";
import { Blankslate } from "./Blankslate";
import { ago } from "./format";
import { claudeCodeCommand, keyStatus, mcpJsonConfig, mcpUrl } from "./keys";
import { keys, keysQuery } from "./queries";

const ROLE_HELP: Record<Role, string> = {
  VIEWER: "read flags, rules and history",
  EDITOR: "also create flags, edit descriptions, change dev",
  ADMIN: "everything, including prod and deleting flags",
};

/** Agent API keys for the MCP endpoint. Admins only (the server enforces it; the page is hidden otherwise). */
export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const list = useQuery(keysQuery);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [days, setDays] = useState(90);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () => api.createKey(name.trim(), role, days),
    onSuccess: (result) => {
      setCreated(result);
      setName("");
      void queryClient.invalidateQueries({ queryKey: keys.keys });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.revokeKey(id),
    onSettled: () => {
      setConfirmRevoke(null);
      void queryClient.invalidateQueries({ queryKey: keys.keys });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setCreated(null);
    create.mutate();
  }

  const nameError = create.error instanceof ApiError ? create.error.fieldErrors.find((f) => f.field === "name")?.message : undefined;
  const origin = window.location.origin;

  return (
    <div className="keys-page">
      <section className="card">
        <h2>API keys for agents</h2>
        <p className="muted">
          An agent connects to the MCP server at <code>{mcpUrl(origin)}</code> with a key. A key acts as one role and can
          do exactly what a person with that role can in this dashboard. Every change it makes is recorded under{" "}
          <code>key:&lt;name&gt;</code>. Keys can't manage keys.
        </p>

        <form className="key-form" onSubmit={submit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="release-bot" maxLength={64} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="VIEWER">viewer</option>
              <option value="EDITOR">editor</option>
              <option value="ADMIN">admin</option>
            </select>
          </label>
          <label>
            Expires in
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 30, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary" disabled={!name.trim() || create.isPending}>
            Create key
          </button>
        </form>
        <p className="muted small">
          {role.toLowerCase()}: {ROLE_HELP[role]}. Give an agent the least it needs.
        </p>
        {create.isError && (
          <p className="error" role="alert">
            {nameError ? `Name ${nameError}.` : create.error.message}
          </p>
        )}

        {created && (
          <div className="new-key" role="status" aria-label="New API key">
            <p>
              <strong>Copy this key now. It won't be shown again.</strong>
            </p>
            <div className="row">
              <code className="token">{created.token}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(created.token)}>
                Copy
              </button>
            </div>
            <p className="muted small">Claude Code:</p>
            <pre>{claudeCodeCommand(origin, created.token)}</pre>
            <p className="muted small">Other MCP clients (JSON config):</p>
            <pre>{mcpJsonConfig(origin, created.token)}</pre>
            <button type="button" onClick={() => setCreated(null)}>
              Done
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Keys</h2>
        {list.isPending && <p className="muted">Loading…</p>}
        {list.isError && <p className="error">{list.error.message}</p>}
        {list.data?.length === 0 && (
          <Blankslate icon={KeyRound} title="No API keys yet">
            Create one above to let an agent manage flags through MCP.
          </Blankslate>
        )}
        {list.data && list.data.length > 0 && (
          <table className="keys">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Key</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((key) => {
                const status = keyStatus(key);
                return (
                  <tr key={key.id} className={status}>
                    <td>{key.name}</td>
                    <td>{key.role.toLowerCase()}</td>
                    <td>
                      <code>{key.prefix}…</code>
                    </td>
                    <td title={new Date(key.createdAt).toLocaleString()}>
                      {ago(key.createdAt)} by {key.createdBy}
                    </td>
                    <td>{key.lastUsedAt ? ago(key.lastUsedAt) : "never"}</td>
                    <td>
                      <span className={`status ${status}`}>{status}</span>
                      {status === "active" && (
                        <span className="muted small"> until {new Date(key.expiresAt).toLocaleDateString()}</span>
                      )}
                      {status === "revoked" && key.revokedBy && <span className="muted small"> by {key.revokedBy}</span>}
                    </td>
                    <td>
                      {status === "active" &&
                        (confirmRevoke === key.id ? (
                          <span className="row">
                            <button type="button" className="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(key.id)}>
                              Revoke now
                            </button>
                            <button type="button" onClick={() => setConfirmRevoke(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="danger" onClick={() => setConfirmRevoke(key.id)}>
                            Revoke
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {revoke.isError && <p className="error">{revoke.error.message}</p>}
        <p className="muted small">Revoking takes effect on the agent's next request.</p>
      </section>
    </div>
  );
}
