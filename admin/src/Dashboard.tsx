import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { api, type Me } from "./api";
import { ApiKeysPage } from "./ApiKeysPage";
import { FlagsPage } from "./FlagsPage";
import { switchSession } from "./queries";

export function Dashboard({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<"flags" | "keys">("flags");
  const logout = useMutation({ mutationFn: api.logout, onSettled: () => switchSession(queryClient, null) });

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Flag size={16} />
          </span>
          <span className="brand-text">Feature Flags</span>
        </span>
        <nav className="nav" aria-label="Sections">
          <button type="button" className={page === "flags" ? "nav-item active" : "nav-item"} onClick={() => setPage("flags")}>
            <Flag size={15} aria-hidden="true" /> Flags
          </button>
          {me.can.manageApiKeys && (
            <button type="button" className={page === "keys" ? "nav-item active" : "nav-item"} onClick={() => setPage("keys")}>
              <KeyRound size={15} aria-hidden="true" /> API keys
            </button>
          )}
        </nav>
        <span className="spacer" />
        <span className="who">
          <span className="avatar" title={`${me.username} (${me.role.toLowerCase()})`}>
            {me.username.slice(0, 2).toUpperCase()}
          </span>
          <span className="who-name">
            {me.username}
            <span className={`role ${me.role.toLowerCase()}`}>{me.role.toLowerCase()}</span>
          </span>
        </span>
        <button type="button" className="icon-button" aria-label="Log out" title="Log out" onClick={() => logout.mutate()}>
          <LogOut size={17} />
        </button>
      </header>

      {page === "keys" && me.can.manageApiKeys ? (
        <main className="flags-page">
          <ApiKeysPage />
        </main>
      ) : (
        <FlagsPage me={me} />
      )}
    </div>
  );
}
