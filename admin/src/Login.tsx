import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "./api";
import { switchSession } from "./queries";

export function Login() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (me) => switchSession(queryClient, me),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate();
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1>Feature flags</h1>
        <p className="muted">Sign in to manage flags.</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {login.isError && (
          <p className="error" role="alert">
            {login.error.message}
          </p>
        )}
        <button type="submit" className="primary" disabled={login.isPending || !username || !password}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted small">Dev logins are listed in the README.</p>
      </form>
    </main>
  );
}
