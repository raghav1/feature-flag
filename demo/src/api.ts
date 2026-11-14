// The only server call the demo makes. /api/evaluate returns results, never rules.

export type Env = "dev" | "prod";

export type Reason = "FLAG_OFF" | "RULE_MATCH" | "OTHERWISE" | "FLAG_NOT_FOUND";

export interface FlagResult {
  value: boolean;
  reason: Reason;
  /** Zero-based; present only when reason is RULE_MATCH. */
  ruleIndex?: number;
  /** "users" | "customers" | "percent"; present only when reason is RULE_MATCH. */
  ruleType?: string;
}

export interface EvaluateResponse {
  environment: Env;
  flags: Record<string, FlagResult>;
}

export interface EvaluationContext {
  userId?: string;
  attributes: Record<string, string>;
}

// SDK keys are public by design: they can only evaluate one environment and never see rules.
// `||` not `??`: a build arg passed empty must fall back too.
const SDK_KEYS: Record<Env, string> = {
  dev: import.meta.env.VITE_SDK_KEY_DEV || "dev-sdk-key",
  prod: import.meta.env.VITE_SDK_KEY_PROD || "prod-sdk-key",
};

/** First render waits for flags, so a dead backend must not hold the page hostage. */
const TIMEOUT_MS = 3000;

export async function evaluate(env: Env, context: EvaluationContext): Promise<EvaluateResponse> {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/json", "X-SDK-Key": SDK_KEYS[env] },
    body: JSON.stringify({ context }),
  });
  if (!response.ok) {
    throw new Error(`Evaluation failed: HTTP ${response.status}`);
  }
  return (await response.json()) as EvaluateResponse;
}
