import { describe, expect, it } from "vitest";
import { explain } from "./explain";

describe("explain", () => {
  it("names the matching rule, 1-based, in plain words", () => {
    expect(explain({ value: true, reason: "RULE_MATCH", ruleIndex: 0, ruleType: "users" }, "prod")).toBe(
      "matched rule 1 (user ID list)",
    );
    expect(explain({ value: true, reason: "RULE_MATCH", ruleIndex: 2, ruleType: "percent" }, "prod")).toBe(
      "matched rule 3 (% rollout)",
    );
    expect(explain({ value: true, reason: "RULE_MATCH", ruleIndex: 0, ruleType: "attribute" }, "prod")).toBe(
      "matched rule 1 (attribute)",
    );
  });

  it("says when a matching rule serves OFF", () => {
    expect(explain({ value: false, reason: "RULE_MATCH", ruleIndex: 1, ruleType: "customers" }, "dev")).toBe(
      "matched rule 2 (customer list), which serves OFF",
    );
  });

  it("falls back to the raw type for rule kinds it doesn't know yet", () => {
    expect(explain({ value: true, reason: "RULE_MATCH", ruleIndex: 0, ruleType: "country" }, "prod")).toBe(
      "matched rule 1 (country)",
    );
  });

  it("explains off, otherwise and missing flags", () => {
    expect(explain({ value: false, reason: "FLAG_OFF" }, "prod")).toBe("flag is OFF in prod");
    expect(explain({ value: true, reason: "OTHERWISE" }, "dev")).toBe("no rule matched → Otherwise ON");
    expect(explain({ value: false, reason: "FLAG_NOT_FOUND" }, "prod")).toBe("flag doesn't exist");
    expect(explain(undefined, "prod")).toBe("not evaluated");
  });
});
