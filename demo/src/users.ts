import type { User } from "@flags/sdk";
import type { Env } from "./api";

/** Fictional demo users, picked so each one takes a different path through the seeded prod rules. */
export interface DemoUser {
  key: string;
  name: string;
  userId?: string;
  customer?: string;
  /** Sent as the `country` attribute; the seeded free-shipping rule targets CA in prod. */
  country?: string;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { key: "u_102", name: "Ana", userId: "u_102", country: "US" },
  { key: "u_207", name: "Ben", userId: "u_207", customer: "acme", country: "CA" },
  { key: "u_350", name: "Cy", userId: "u_350", customer: "acme", country: "US" },
  { key: "u_303", name: "Dee", userId: "u_303", customer: "zenith", country: "DE" },
  { key: "u_412", name: "Eli", userId: "u_412", customer: "zenith" },
  { key: "anonymous", name: "Anonymous visitor" },
];

const DEFAULT_USER = "u_207";

export function label(user: DemoUser): string {
  const id = user.userId ? ` · ${user.userId}` : "";
  const details = [user.customer, user.country].filter(Boolean).join(", ");
  return `${user.name}${id}${details ? ` (${details})` : ""}`;
}

/** The SDK's view of a demo user. Same object per demo user, so the SDK's cache lookups stay cheap. */
const SDK_USERS = new Map<string, User>();

export function sdkUser(user: DemoUser): User {
  let mapped = SDK_USERS.get(user.key);
  if (!mapped) {
    mapped = {
      ...(user.userId ? { id: user.userId } : {}),
      attributes: {
        ...(user.customer ? { customer: user.customer } : {}),
        ...(user.country ? { country: user.country } : {}),
      },
    };
    SDK_USERS.set(user.key, mapped);
  }
  return mapped;
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
