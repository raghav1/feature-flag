import type { AttributeOperator, Rule } from "./api";

/**
 * Editable form of a rule. `ids` are the committed chips (always well-formed); `pending` is text typed but not
 * yet turned into chips. Saving includes pending IDs, so what's on screen is what gets saved. An attribute rule's
 * values use the same chips (`ids`/`pending`) and are validated like IDs.
 */
export type DraftRule =
  | { type: "users"; ids: string[]; pending: string; serve: boolean }
  | { type: "customers"; ids: string[]; pending: string; serve: boolean }
  | { type: "percent"; percent: number; serve: boolean }
  | { type: "attribute"; attribute: string; operator: AttributeOperator; ids: string[]; pending: string; serve: boolean };

/** Committed chips plus any well-formed pending IDs, in order, without duplicates. */
export function effectiveIds(draft: { ids: readonly string[]; pending: string }): string[] {
  return addIds(draft.ids, draft.pending).ids;
}

export const RULE_LABELS: Record<DraftRule["type"], string> = {
  users: "Specific users",
  customers: "Specific customers",
  percent: "Percentage of users",
  attribute: "Users by attribute",
};

/** Splits on commas, spaces and newlines; drops empties and duplicates, keeps order. */
export function parseIds(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((id) => id.length > 0))];
}

/** Mirrors the server's ID rule (ContextIds.PATTERN). The server is the authority; this gives instant feedback. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;
export const ID_RULE = "Use letters, digits and _ . : @ -, starting with a letter or digit (max 128).";

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Mirrors the server's attribute-name rule (AttributeNames.PATTERN), e.g. "country" or "app_version". */
const ATTRIBUTE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const ATTRIBUTE_NAME_RULE = "Use lowercase letters, digits and _, starting with a letter (max 64).";

export function isValidAttributeName(name: string): boolean {
  return ATTRIBUTE_NAME_PATTERN.test(name);
}

export interface IdEntry {
  /** The list after adding the valid, new IDs. */
  ids: string[];
  /** Entries refused as malformed, to show the user. */
  rejected: string[];
}

/** Adds typed or pasted text (one or many IDs) to a list: skips duplicates, refuses malformed IDs. */
export function addIds(current: readonly string[], text: string): IdEntry {
  const ids = [...current];
  const rejected: string[] = [];
  for (const id of parseIds(text)) {
    if (!isValidId(id)) rejected.push(id);
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, rejected };
}

/** True when some rule's box holds text that can't become an ID: an edit to throw away, though no rule changed. */
export function hasRejectedText(drafts: readonly DraftRule[]): boolean {
  return drafts.some((d) => d.type !== "percent" && addIds(d.ids, d.pending).rejected.length > 0);
}

export function toDraft(rule: Rule): DraftRule {
  switch (rule.type) {
    case "users":
      return { type: "users", ids: [...rule.userIds], pending: "", serve: rule.serve };
    case "customers":
      return { type: "customers", ids: [...rule.customerIds], pending: "", serve: rule.serve };
    case "percent":
      return { type: "percent", percent: rule.percent, serve: rule.serve };
    case "attribute":
      return { type: "attribute", attribute: rule.attribute, operator: rule.operator, ids: [...rule.values], pending: "", serve: rule.serve };
  }
}

export function fromDraft(draft: DraftRule): Rule {
  switch (draft.type) {
    case "users":
      return { type: "users", userIds: effectiveIds(draft), serve: draft.serve };
    case "customers":
      return { type: "customers", customerIds: effectiveIds(draft), serve: draft.serve };
    case "percent":
      return { type: "percent", percent: draft.percent, serve: draft.serve };
    case "attribute":
      // Key order matches the server's JSON, so an unedited rule compares equal to what was loaded.
      return { type: "attribute", attribute: draft.attribute, operator: draft.operator, values: effectiveIds(draft), serve: draft.serve };
  }
}

export function newDraft(type: DraftRule["type"]): DraftRule {
  switch (type) {
    case "percent":
      return { type, percent: 10, serve: true };
    case "attribute":
      return { type, attribute: "", operator: "in", ids: [], pending: "", serve: true };
    default:
      return { type, ids: [], pending: "", serve: true };
  }
}

/** Problems that would make the server reject the save, per rule index. */
export interface DraftProblem {
  message: string;
  /** "hint": not finished yet (an empty new rule), shown neutrally. "error": a mistake. Both block saving. */
  severity: "hint" | "error";
}

/** What would make the server reject the save, per rule index. */
export function draftProblems(drafts: DraftRule[]): Map<number, DraftProblem> {
  const problems = new Map<number, DraftProblem>();
  drafts.forEach((d, i) => {
    if (d.type === "percent") {
      if (!Number.isInteger(d.percent) || d.percent < 0 || d.percent > 100) {
        problems.set(i, { message: "Use a whole number from 0 to 100.", severity: "error" });
      }
    } else if (d.type === "attribute" && d.attribute !== "" && !isValidAttributeName(d.attribute)) {
      problems.set(i, { message: ATTRIBUTE_NAME_RULE, severity: "error" });
    } else {
      const rejected = addIds(d.ids, d.pending).rejected;
      if (rejected.length > 0 || d.ids.some((id) => !isValidId(id))) {
        problems.set(i, { message: `Fix ${rejected.map((r) => `"${r}"`).join(", ") || (d.type === "attribute" ? "the values" : "the IDs")} first. ${ID_RULE}`, severity: "error" });
      } else if (d.type === "attribute") {
        if (d.attribute === "" || effectiveIds(d).length === 0) {
          problems.set(i, { message: "Add an attribute name and at least one value.", severity: "hint" });
        }
      } else if (effectiveIds(d).length === 0) {
        problems.set(i, { message: d.type === "users" ? "Add at least one user ID." : "Add at least one customer.", severity: "hint" });
      }
    }
  });
  return problems;
}

export function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return [...items];
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  if (item !== undefined) copy.splice(to, 0, item);
  return copy;
}
