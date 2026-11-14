import { describe, expect, it } from "vitest";
import type { Rule } from "./api";
import { draftProblems, fromDraft, move, newDraft, parseIds, toDraft } from "./rules";

describe("parseIds", () => {
  it("accepts commas, spaces and newlines, and drops empties and duplicates", () => {
    expect(parseIds("u_102, u_207\nu_102  u_300,,")).toEqual(["u_102", "u_207", "u_300"]);
    expect(parseIds("  ")).toEqual([]);
  });
});

describe("drafts", () => {
  it("round-trip every rule type", () => {
    const rules: Rule[] = [
      { type: "users", userIds: ["u_102", "u_207"], serve: true },
      { type: "customers", customerIds: ["acme"], serve: false },
      { type: "percent", percent: 10, serve: true },
    ];
    expect(rules.map(toDraft).map(fromDraft)).toEqual(rules);
  });

  it("flags what the server would reject", () => {
    const problems = draftProblems([newDraft("users"), { type: "percent", percent: 101, serve: true }, newDraft("percent")]);
    expect([...problems.keys()]).toEqual([0, 1]);
  });
});

describe("move", () => {
  it("moves an item and ignores moves past either end", () => {
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(move(["a", "b"], 1, 2)).toEqual(["a", "b"]);
  });
});
