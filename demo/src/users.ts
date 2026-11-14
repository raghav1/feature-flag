import type { Env, EvaluationContext } from "./api";

/** Fictional demo users, picked so each one takes a different path through the seeded prod rules. */
export interface DemoUser {
  key: string;
  name: string;
  userId?: string;
  customer?: string;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { key: "u_102", name: "Ana", userId: "u_102" },
  { key: "u_207", name: "Ben", userId: "u_207", customer: "acme" },
  { key: "u_350", name: "Cy", userId: "u_350", customer: "acme" },
  { key: "u_303", name: "Dee", userId: "u_303", customer: "zenith" },
  { key: "u_412", name: "Eli", userId: "u_412", customer: "zenith" },
  { key: "anonymous", name: "Anonymous visitor" },
];

const DEFAULT_USER = "u_207";

export function label(user: DemoUser): string {
  const id = user.userId ? ` · ${user.userId}` : "";
  const customer = user.customer ? ` (${user.customer})` : "";
  return `${user.name}${id}${customer}`;
}

export function contextFor(user: DemoUser): EvaluationContext {
  return {
    ...(user.userId ? { userId: user.userId } : {}),
    attributes: user.customer ? { customer: user.customer } : {},
  };
}

export interface Selection {
  user: DemoUser;
  env: Env;
}

/** Reads ?user=&env= so a reload (or a shared link) shows the same view. Unknown values fall back to defaults. */
export function readSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  const fallback = DEMO_USERS.find((u) => u.key === DEFAULT_USER) ?? DEMO_USERS[0]!;
  const user = DEMO_USERS.find((u) => u.key === params.get("user")) ?? fallback;
  const env: Env = params.get("env") === "dev" ? "dev" : "prod";
  return { user, env };
}

export function toSearch(selection: Selection): string {
  return `?${new URLSearchParams({ user: selection.user.key, env: selection.env }).toString()}`;
}
