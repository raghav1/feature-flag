// Demo configuration. All flag fetching goes through the SDK (sdk/), which only ever sees results.

export type Env = "dev" | "prod";

// SDK keys are public by design: they can only evaluate one environment and never see rules.
// `||` not `??`: a build arg passed empty must fall back too.
export const SDK_KEYS: Record<Env, string> = {
  dev: import.meta.env.VITE_SDK_KEY_DEV || "dev-sdk-key",
  prod: import.meta.env.VITE_SDK_KEY_PROD || "prod-sdk-key",
};
