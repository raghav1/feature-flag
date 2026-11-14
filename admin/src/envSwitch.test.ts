import { describe, expect, it } from "vitest";
import type { EnvironmentState } from "./api";
import { prodImpact } from "./EnvSwitch";

const off = (rules: EnvironmentState["rules"], otherwise = false): EnvironmentState => ({
  enabled: false,
  otherwise,
  rules,
  version: 0,
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("prodImpact", () => {
  it("never claims users get a feature nobody can match", () => {
    expect(prodImpact(off([]), true)).toBe(
      "It will be on, but no rule matches anyone yet, so nobody gets it until you add a rule or set Everyone else to ON.",
    );
  });

  it("says who starts getting it", () => {
    expect(prodImpact(off([], true), true)).toBe("Everyone in prod gets this feature right away.");
    expect(prodImpact(off([{ type: "percent", percent: 10, serve: true }]), true)).toBe(
      "Real users start getting it right away: 10% of users.",
    );
  });

  it("warns that turning off affects everyone but keeps the rules", () => {
    expect(prodImpact({ ...off([]), enabled: true }, false)).toContain("Everyone in prod loses this feature");
  });
});
