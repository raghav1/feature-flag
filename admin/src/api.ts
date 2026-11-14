// Typed client for the admin API. Session cookie auth; changes send the CSRF token from the XSRF-TOKEN cookie.

export type Role = "ADMIN" | "EDITOR" | "VIEWER";

/** From the server's AccessPolicy. The UI only uses it to enable controls; the server enforces. */
export interface Permissions {
  createFlag: boolean;
  editDescription: boolean;
  deleteFlag: boolean;
  changeEnvironments: string[];
  manageApiKeys: boolean;
}

export interface Me {
  username: string;
  role: Role;
  can: Permissions;
}

export interface Environment {
  key: string;
  name: string;
}

export type Rule =
  | { type: "users"; userIds: string[]; serve: boolean }
  | { type: "customers"; customerIds: string[]; serve: boolean }
  | { type: "percent"; percent: number; serve: boolean };

export interface EnvironmentState {
  enabled: boolean;
  otherwise: boolean;
  rules: Rule[];
  version: number;
  updatedAt: string;
}

export interface Flag {
  key: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  environments: Record<string, EnvironmentState>;
}

export interface AuditEvent {
  id: number;
  at: string;
  actor: string;
  flagKey: string;
  envKey: string | null;
  action: string;
  summary: string;
}

export interface ApiKey {
  id: number;
  name: string;
  role: Role;
  /** First characters of the token, to recognise it. The token itself is only shown once, at creation. */
  prefix: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export interface CreatedKey {
  key: ApiKey;
  token: string;
}

export type IdKind = "user" | "customer";

/** An ID the flag service has evaluated. */
export interface SeenId {
  value: string;
  lastSeen: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
}

function csrfToken(): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith("XSRF-TOKEN="))
    ?.slice("XSRF-TOKEN=".length);
}

interface Problem {
  detail?: string;
  title?: string;
  errors?: FieldError[];
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = csrfToken();
  if (method !== "GET" && token) headers["X-XSRF-TOKEN"] = decodeURIComponent(token);

  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as Problem;
    throw new ApiError(response.status, problem.detail ?? problem.title ?? `HTTP ${response.status}`, problem.errors ?? []);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  /** null when not logged in. */
  me: async (): Promise<Me | null> => {
    try {
      return await request<Me>("GET", "/api/auth/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  login: (username: string, password: string) => request<Me>("POST", "/api/auth/login", { username, password }),
  logout: () => request<void>("POST", "/api/auth/logout"),
  environments: () => request<Environment[]>("GET", "/api/environments"),
  flags: () => request<Flag[]>("GET", "/api/flags"),
  createFlag: (key: string, description: string) => request<Flag>("POST", "/api/flags", { key, description }),
  updateDescription: (key: string, description: string) =>
    request<Flag>("PATCH", `/api/flags/${encodeURIComponent(key)}`, { description }),
  deleteFlag: (key: string) => request<void>("DELETE", `/api/flags/${encodeURIComponent(key)}`),
  setEnabled: (key: string, env: string, enabled: boolean, version: number) =>
    request<EnvironmentState>("PUT", `/api/flags/${encodeURIComponent(key)}/envs/${env}/enabled`, { enabled, version }),
  setRules: (key: string, env: string, rules: Rule[], otherwise: boolean, version: number) =>
    request<EnvironmentState>("PUT", `/api/flags/${encodeURIComponent(key)}/envs/${env}/rules`, {
      rules,
      otherwise,
      version,
    }),
  suggestIds: (kind: IdKind, query: string, limit = 8) =>
    request<SeenId[]>("GET", `/api/contexts?${new URLSearchParams({ kind, query, limit: String(limit) }).toString()}`),
  unseenIds: (kind: IdKind, ids: readonly string[]) => {
    const params = new URLSearchParams({ kind });
    ids.forEach((id) => params.append("value", id));
    return request<{ unseen: string[] }>("GET", `/api/contexts/unseen?${params.toString()}`);
  },
  keys: () => request<ApiKey[]>("GET", "/api/keys"),
  createKey: (name: string, role: Role, expiresInDays: number) =>
    request<CreatedKey>("POST", "/api/keys", { name, role, expiresInDays }),
  revokeKey: (id: number) => request<void>("DELETE", `/api/keys/${id}`),
  audit: (flagKey: string) =>
    request<AuditEvent[]>("GET", `/api/audit?${new URLSearchParams({ flag: flagKey, limit: "20" }).toString()}`),
};
