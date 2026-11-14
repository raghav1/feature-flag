import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { api, type Me } from "./api";

export const keys = {
  me: ["me"] as const,
  environments: ["environments"] as const,
  flags: ["flags"] as const,
  audit: (flagKey: string) => ["audit", flagKey] as const,
  keys: ["keys"] as const,
};

export const meQuery = queryOptions({ queryKey: keys.me, queryFn: api.me, staleTime: Infinity });
export const environmentsQuery = queryOptions({ queryKey: keys.environments, queryFn: api.environments, staleTime: Infinity });
export const flagsQuery = queryOptions({ queryKey: keys.flags, queryFn: api.flags });
export const keysQuery = queryOptions({ queryKey: keys.keys, queryFn: api.keys });
export const auditQuery = (flagKey: string) => queryOptions({ queryKey: keys.audit(flagKey), queryFn: () => api.audit(flagKey) });

/**
 * Switch the cached session to a new user (or none), dropping everything cached for the previous one.
 * Not queryClient.clear(): that also removes the "me" query App is subscribed to, so the new value would land
 * in a query nobody is watching and the screen wouldn't change.
 */
export function switchSession(queryClient: QueryClient, me: Me | null) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.me[0] });
  queryClient.setQueryData(keys.me, me);
}
