import type { FlagResult } from "@flags/sdk";
import type { Env } from "./api";

const RULE_LABELS: Record<string, string> = {
  users: "user ID list",
  customers: "customer list",
  percent: "% rollout",
};

/** Plain-words "why" for the debug panel. */
export function explain(result: FlagResult | undefined, env: Env): string {
  if (!result) {
    return "not evaluated";
  }
  switch (result.reason) {
    case "FLAG_OFF":
      return `flag is OFF in ${env}`;
    case "RULE_MATCH": {
      const rule = result.ruleIndex === undefined ? "a rule" : `rule ${result.ruleIndex + 1}`;
      const kind = result.ruleType ? ` (${RULE_LABELS[result.ruleType] ?? result.ruleType})` : "";
      return `matched ${rule}${kind}${result.value ? "" : ", which serves OFF"}`;
    }
    case "OTHERWISE":
      return `no rule matched → Otherwise ${result.value ? "ON" : "OFF"}`;
    case "FLAG_NOT_FOUND":
      return "flag doesn't exist";
  }
}
