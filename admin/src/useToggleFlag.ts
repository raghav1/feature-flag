import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Flag } from "./api";
import { keys, refreshFlag } from "./queries";

export interface Toggle {
  key: string;
  env: string;
  enabled: boolean;
  version: number;
}

/** Turn a flag on/off in one environment. Optimistic: flips at once, rolls back if the server says no. */
export function useToggleFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (t: Toggle) => api.setEnabled(t.key, t.env, t.enabled, t.version),
    onMutate: async (t) => {
      await queryClient.cancelQueries({ queryKey: keys.flags });
      const previous = queryClient.getQueryData<Flag[]>(keys.flags);
      queryClient.setQueryData<Flag[]>(keys.flags, (old) =>
        old?.map((f) =>
          f.key !== t.key
            ? f
            : { ...f, environments: { ...f.environments, [t.env]: { ...f.environments[t.env]!, enabled: t.enabled } } },
        ),
      );
      return { previous };
    },
    onError: (_error, _t, context) => {
      if (context?.previous) queryClient.setQueryData(keys.flags, context.previous);
    },
    onSettled: (_data, _error, t) => refreshFlag(queryClient, t.key),
  });
}
