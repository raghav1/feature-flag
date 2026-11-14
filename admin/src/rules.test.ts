import { describe, expect, it } from "vitest";
import type { Rule } from "./api";
import { addIds, draftProblems, effectiveIds, fromDraft, isValidId, move, newDraft, parseIds, toDraft } from "./rules";

describe("parseIds", () => {
  it("accepts commas, spaces and newlines, and drops empties and duplicates", () => {
    expect(parseIds("u_102, u_207\nu_102  u_300,,")).toEqual(["u_102", "u_207", "u_300"]);
    expect(parseIds("  ")).toEqual([]);
  });
});

describe("isValidId", () => {
  it("matches the server's rule", () => {
    for (const ok of ["u_102", "acme", "5f3c9a2e-7d41-4c1b-9e0a-2b6f8d1c3a77", "ana@example.com", "org:acme"]) {
      expect(isValidId(ok), ok).toBe(true);
    }
    for (const bad of ["", "acme!", "_lead", "-lead", "a/b", "ünï", "a".repeat(129)]) {
      expect(isValidId(bad), bad).toBe(false);
    }
  });
});

describe("addIds", () => {
  it("adds new valid IDs in order, skips duplicates, and reports malformed ones", () => {
    expect(addIds(["u_102"], "u_207, u_102  acme! u_303")).toEqual({ ids: ["u_102", "u_207", "u_303"], rejected: ["acme!"] });
  });

  it("leaves the list alone for empty input", () => {
    expect(addIds(["u_1"], "  , ")).toEqual({ ids: ["u_1"], rejected: [] });
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

  it("treat an empty new rule as a hint and real mistakes as errors", () => {
    const problems = draftProblems([newDraft("users"), { type: "percent", percent: 101, serve: true }, newDraft("percent")]);

    expect(problems.get(0)).toEqual({ message: "Add at least one user ID.", severity: "hint" });
    expect(problems.get(1)?.severity).toBe("error");
    expect(problems.has(2)).toBe(false);
  });

  it("flag malformed IDs that came from somewhere other than the chip input", () => {
    expect(draftProblems([{ type: "customers", ids: ["acme!"], pending: "", serve: true }]).get(0)?.severity).toBe("error");
  });

  it("save typed-but-uncommitted IDs too, so what's on screen is what's saved", () => {
    const draft = { type: "users" as const, ids: ["u_350"], pending: "u_303, u_350", serve: true };

    expect(effectiveIds(draft)).toEqual(["u_350", "u_303"]);
    expect(fromDraft(draft)).toEqual({ type: "users", userIds: ["u_350", "u_303"], serve: true });
    expect(draftProblems([{ type: "users", ids: [], pending: "u_9", serve: true }]).size).toBe(0);
  });

  it("block saving while typed text is malformed, naming it", () => {
    const problem = draftProblems([{ type: "users", ids: ["u_1"], pending: "acme!", serve: true }]).get(0);

    expect(problem?.severity).toBe("error");
    expect(problem?.message).toContain('"acme!"');
  });
});

describe("move", () => {
  it("moves an item and ignores moves past either end", () => {
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(move(["a", "b"], 1, 2)).toEqual(["a", "b"]);
  });
});
