import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Environment, type Flag, type Permissions } from "./api";
import { keys } from "./queries";

interface FlagTableProps {
  flags: Flag[];
  environments: Environment[];
  can: Permissions;
  selected: string | null;
  onSelect: (key: string) => void;
}

interface Toggle {
  key: string;
  env: string;
  enabled: boolean;
  version: number;
}

export function FlagTable({ flags, environments, can, selected, onSelect }: FlagTableProps) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (t: Toggle) => api.setEnabled(t.key, t.env, t.enabled, t.version),
    // Optimistic: flip the switch now, roll back if the server says no (403, 409…).
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
    onSettled: (_data, _error, t) => {
      void queryClient.invalidateQueries({ queryKey: keys.flags });
      void queryClient.invalidateQueries({ queryKey: keys.audit(t.key) });
    },
  });

  if (flags.length === 0) return <p className="muted">No flags yet.</p>;

  return (
    <>
      {toggle.isError && (
        <p className="error" role="alert">
          {toggle.error.message}
        </p>
      )}
      <table className="flags">
        <thead>
          <tr>
            <th>Flag</th>
            {environments.map((env) => (
              <th key={env.key} className="env-col">
                {env.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flags.map((flag) => (
            <tr
              key={flag.key}
              className={flag.key === selected ? "selected" : undefined}
              onClick={() => onSelect(flag.key)}
            >
              <td>
                <div className="flag-key">{flag.key}</div>
                <div className="muted small">{flag.description || "No description"}</div>
              </td>
              {environments.map((env) => {
                const state = flag.environments[env.key];
                const allowed = can.changeEnvironments.includes(env.key);
                if (!state) return <td key={env.key} />;
                return (
                  <td key={env.key} className="env-col" onClick={(e) => e.stopPropagation()}>
                    <label className="switch" title={allowed ? undefined : `Your role can't change ${env.key}`}>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`${flag.key} in ${env.key}`}
                        checked={state.enabled}
                        disabled={!allowed || toggle.isPending}
                        onChange={() =>
                          toggle.mutate({ key: flag.key, env: env.key, enabled: !state.enabled, version: state.version })
                        }
                      />
                      <span className="track" />
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
