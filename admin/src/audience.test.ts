import { describe, expect, it } from "vitest";
import type { EnvironmentState, Rule } from "./api";
import { audienceSentence, envStatus, ruleAudience } from "./audience";

function env(enabled: boolean, rules: Rule[], otherwise = false): EnvironmentState {
  return { enabled, rules, otherwise, version: 0, updatedAt: "2026-01-01T00:00:00Z" };
}

const users: Rule = { type: "users", userIds: ["u_102", "u_207"], serve: true };
const acme: Rule = { type: "customers", customerIds: ["acme"], serve: true };
const tenPercent: Rule = { type: "percent", percent: 10, serve: true };

describe("envStatus", () => {
  it("is off whenever the flag is disabled, whatever the rules", () => {
    expect(envStatus(env(false, [users], true))).toBe("off");
  });

  it("is live when everyone gets it", () => {
    expect(envStatus(env(true, [], true))).toBe("live");
    expect(envStatus(env(true, [users], true))).toBe("live");
  });

  it("is partial when some people get it", () => {
    expect(envStatus(env(true, [users, acme, tenPercent]))).toBe("partial");
    expect(envStatus(env(true, [{ ...acme, serve: false }], true))).toBe("partial");
  });

  it("is off when it's on but nobody can match", () => {
    expect(envStatus(env(true, []))).toBe("off");
    expect(envStatus(env(true, [{ type: "percent", percent: 0, serve: true }]))).toBe("off");
  });
});

describe("audienceSentence", () => {
  it("answers 'who gets this?' in plain words", () => {
    expect(audienceSentence(env(false, [users]))).toBe("Off for everyone");
    expect(audienceSentence(env(true, [], true))).toBe("On for everyone");
    expect(audienceSentence(env(true, [users, acme, tenPercent]))).toBe(
      "On for users u_102 and u_207, customer acme and 10% of users",
    );
    expect(audienceSentence(env(true, [{ ...acme, serve: false }], true))).toBe("On for everyone except customer acme");
    expect(audienceSentence(env(true, []))).toBe("On, but nobody matches a rule yet");
  });

  it("counts long lists instead of listing them", () => {
    expect(ruleAudience({ type: "users", userIds: ["a", "b", "c"], serve: true })).toBe("3 users");
    expect(ruleAudience({ type: "customers", customerIds: ["acme", "zenith"], serve: true })).toBe("customers acme and zenith");
  });
});

describe("attribute rules (AD-16)", () => {
  const attr = (operator: "in" | "not_in", values: string[], serve = true): Rule => ({
    type: "attribute",
    attribute: "country",
    operator,
    values,
    serve,
  });

  it("read as 'users with country …' / 'users whose country isn't …'", () => {
    expect(ruleAudience(attr("in", ["US", "CA"]))).toBe("users with country US or CA");
    expect(ruleAudience(attr("in", ["US"]))).toBe("users with country US");
    expect(ruleAudience(attr("not_in", ["US"]))).toBe("users whose country isn't US");
    expect(ruleAudience(attr("not_in", ["US", "CA"]))).toBe("users whose country isn't US or CA");
  });

  it("count more than two values", () => {
    expect(ruleAudience(attr("in", ["US", "CA", "MX"]))).toBe("users with country in 3 values");
    expect(ruleAudience(attr("not_in", ["US", "CA", "MX"]))).toBe("users whose country isn't in 3 values");
  });

  it("join with the other rules in one sentence", () => {
    const oneUser: Rule = { type: "users", userIds: ["u_102"], serve: true };

    expect(audienceSentence(env(true, [attr("in", ["US", "CA"])]))).toBe("On for users with country US or CA");
    expect(audienceSentence(env(true, [oneUser, attr("in", ["US", "CA"]), tenPercent]))).toBe(
      "On for user u_102, users with country US or CA and 10% of users",
    );
    expect(audienceSentence(env(true, [attr("not_in", ["US"], false)], true))).toBe("On for everyone except users whose country isn't US");
    expect(envStatus(env(true, [attr("in", ["US"])]))).toBe("partial");
  });
});
