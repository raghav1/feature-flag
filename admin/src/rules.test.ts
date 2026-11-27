import { describe, expect, it } from "vitest";
import type { Rule } from "./api";
import {
  addIds,
  ATTRIBUTE_NAME_RULE,
  draftProblems,
  effectiveIds,
  fromDraft,
  hasRejectedText,
  ID_RULE,
  isValidAttributeName,
  isValidId,
  move,
  newDraft,
  parseIds,
  RULE_LABELS,
  toDraft,
  type DraftRule,
} from "./rules";

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
      { type: "attribute", attribute: "country", operator: "in", values: ["US", "CA"], serve: true },
      { type: "attribute", attribute: "plan", operator: "not_in", values: ["free"], serve: false },
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

describe("hasRejectedText", () => {
  it("is true only when a box holds text that can't become an ID", () => {
    expect(hasRejectedText([{ type: "users", ids: ["u_102"], pending: "bad#id", serve: true }])).toBe(true);
    expect(hasRejectedText([{ type: "users", ids: ["u_102"], pending: "u_501", serve: true }])).toBe(false);
    expect(hasRejectedText([{ type: "customers", ids: [], pending: "", serve: true }])).toBe(false);
    expect(hasRejectedText([{ type: "percent", percent: 10, serve: true }])).toBe(false);
  });
});

describe("attribute rules", () => {
  const attribute = (fields: Partial<Extract<DraftRule, { type: "attribute" }>>): DraftRule => ({
    type: "attribute",
    attribute: "country",
    operator: "in",
    ids: ["US"],
    pending: "",
    serve: true,
    ...fields,
  });

  it("are added as 'Users by attribute'", () => {
    expect(RULE_LABELS.attribute).toBe("Users by attribute");
  });

  it("load into the editor from the server's JSON", () => {
    expect(toDraft({ type: "attribute", attribute: "country", operator: "in", values: ["US", "CA"], serve: true })).toEqual(
      attribute({ ids: ["US", "CA"] }),
    );
  });

  it("save as the server's JSON, in the server's key order, including typed values", () => {
    const saved = fromDraft(attribute({ ids: ["US"], pending: "CA" }));

    expect(JSON.stringify(saved)).toBe('{"type":"attribute","attribute":"country","operator":"in","values":["US","CA"],"serve":true}');
  });

  it("start empty, with 'is one of', serving ON", () => {
    expect(newDraft("attribute")).toEqual(attribute({ attribute: "", ids: [] }));
  });

  it("hint while the name or values are missing", () => {
    const hint = { message: "Add an attribute name and at least one value.", severity: "hint" };

    expect(draftProblems([newDraft("attribute")]).get(0)).toEqual(hint);
    expect(draftProblems([attribute({ attribute: "" })]).get(0)).toEqual(hint);
    expect(draftProblems([attribute({ ids: [] })]).get(0)).toEqual(hint);
    expect(draftProblems([attribute({})]).size).toBe(0);
  });

  it("reject a name the server would reject", () => {
    expect(draftProblems([attribute({ attribute: "Country" })]).get(0)).toEqual({ message: ATTRIBUTE_NAME_RULE, severity: "error" });
    expect(ATTRIBUTE_NAME_RULE).toBe("Use lowercase letters, digits and _, starting with a letter (max 64).");
    expect(draftProblems([attribute({ attribute: "Country", ids: [] })]).get(0)?.severity).toBe("error");
  });

  it("mirror the server's name pattern", () => {
    for (const ok of ["country", "app_version", "a", "a".repeat(64), "x9"]) expect(isValidAttributeName(ok), ok).toBe(true);
    for (const bad of ["", "Country", "_country", "9lives", "app-version", " country", "a".repeat(65)]) {
      expect(isValidAttributeName(bad), bad).toBe(false);
    }
  });

  it("block saving while a typed value is malformed, like ID chips", () => {
    for (const pending of [" CA x!", "C#A"]) {
      const problem = draftProblems([attribute({ pending })]).get(0);
      expect(problem?.severity, pending).toBe("error");
    }
    expect(draftProblems([attribute({ ids: ["C A"] })]).get(0)?.severity).toBe("error");
    expect(hasRejectedText([attribute({ pending: "C#A" })])).toBe(true);
    expect(hasRejectedText([attribute({ pending: "CA" })])).toBe(false);
  });

  it("call malformed values 'values', not IDs, keeping the character rule", () => {
    expect(draftProblems([attribute({ ids: ["C A"] })]).get(0)?.message).toBe(`Fix the values first. ${ID_RULE}`);
    expect(draftProblems([attribute({ pending: "C#A" })]).get(0)?.message).toBe(`Fix "C#A" first. ${ID_RULE}`);
    expect(draftProblems([{ type: "users", ids: ["u 1"], pending: "", serve: true }]).get(0)?.message).toBe(`Fix the IDs first. ${ID_RULE}`);
  });

  it("reorder like any other rule", () => {
    const rules = [newDraft("users"), attribute({}), newDraft("percent")];

    expect(move(rules, 1, 0).map(fromDraft).map((r) => r.type)).toEqual(["attribute", "users", "percent"]);
  });
});
