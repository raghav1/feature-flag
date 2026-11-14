import type { EnvironmentState, Rule } from "./api";

/**
 * At-a-glance state of a flag in one environment, as a product manager thinks about it:
 * live = everyone gets the feature, partial = some people do, off = nobody does.
 */
export type EnvStatus = "live" | "partial" | "off";

const servesOn = (rule: Rule) => rule.serve && (rule.type !== "percent" || rule.percent > 0);

export function envStatus(state: EnvironmentState): EnvStatus {
  if (!state.enabled) return "off";
  const anyOn = state.rules.some(servesOn);
  const anyOff = state.rules.some((r) => !r.serve);
  if (state.otherwise) return anyOff ? "partial" : "live";
  return anyOn ? "partial" : "off";
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function ids(noun: string, values: string[]): string {
  if (values.length > 2) return `${values.length} ${noun}s`;
  return `${noun}${values.length > 1 ? "s" : ""} ${list(values)}`;
}

/** Who a rule targets, in words: "users u_102 and u_207", "customer acme", "10% of users". */
export function ruleAudience(rule: Rule): string {
  switch (rule.type) {
    case "users":
      return ids("user", rule.userIds);
    case "customers":
      return ids("customer", rule.customerIds);
    case "percent":
      return `${rule.percent}% of users`;
  }
}

/** One sentence answering "who gets this feature here?". */
export function audienceSentence(state: EnvironmentState): string {
  if (!state.enabled) return "Off for everyone";
  const status = envStatus(state);
  if (status === "live") return "On for everyone";
  if (status === "off") return "On, but nobody matches a rule yet";
  if (state.otherwise) {
    return `On for everyone except ${list(state.rules.filter((r) => !r.serve).map(ruleAudience))}`;
  }
  return `On for ${list(state.rules.filter(servesOn).map(ruleAudience))}`;
}

export const STATUS_LABELS: Record<EnvStatus, string> = {
  live: "Live",
  partial: "Partial",
  off: "Off",
};
