import type { Rule } from "./api";

/** Editable form of a rule: ID lists are free text until saved. */
export type DraftRule =
  | { type: "users"; ids: string; serve: boolean }
  | { type: "customers"; ids: string; serve: boolean }
  | { type: "percent"; percent: number; serve: boolean };

export const RULE_LABELS: Record<DraftRule["type"], string> = {
  users: "User ID in",
  customers: "Customer in",
  percent: "Percentage rollout",
};

/** Splits on commas, spaces and newlines; drops empties and duplicates, keeps order. */
export function parseIds(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((id) => id.length > 0))];
}

export function toDraft(rule: Rule): DraftRule {
  switch (rule.type) {
    case "users":
      return { type: "users", ids: rule.userIds.join(", "), serve: rule.serve };
    case "customers":
      return { type: "customers", ids: rule.customerIds.join(", "), serve: rule.serve };
    case "percent":
      return { type: "percent", percent: rule.percent, serve: rule.serve };
  }
}

export function fromDraft(draft: DraftRule): Rule {
  switch (draft.type) {
    case "users":
      return { type: "users", userIds: parseIds(draft.ids), serve: draft.serve };
    case "customers":
      return { type: "customers", customerIds: parseIds(draft.ids), serve: draft.serve };
    case "percent":
      return { type: "percent", percent: draft.percent, serve: draft.serve };
  }
}

export function newDraft(type: DraftRule["type"]): DraftRule {
  return type === "percent" ? { type, percent: 10, serve: true } : { type, ids: "", serve: true };
}

/** Problems that would make the server reject the save, per rule index. */
export function draftProblems(drafts: DraftRule[]): Map<number, string> {
  const problems = new Map<number, string>();
  drafts.forEach((d, i) => {
    if (d.type === "percent") {
      if (!Number.isInteger(d.percent) || d.percent < 0 || d.percent > 100) problems.set(i, "Use a whole number from 0 to 100.");
    } else if (parseIds(d.ids).length === 0) {
      problems.set(i, d.type === "users" ? "Add at least one user ID." : "Add at least one customer.");
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
