import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./api";
import { changeKind, groupByDay, highlight } from "./activityLog";

const event = (id: number, at: string, action: AuditEvent["action"] = "RULES_UPDATED", summary = "rollout 5% → 10%"): AuditEvent => ({
  id,
  at,
  actor: "admin",
  flagKey: "dark-mode",
  envKey: "prod",
  action,
  summary,
});

describe("changeKind", () => {
  it("splits toggles into on and off and names the rest", () => {
    expect(changeKind(event(1, "", "FLAG_TOGGLED", "turned ON"))).toBe("on");
    expect(changeKind(event(1, "", "FLAG_TOGGLED", "turned OFF"))).toBe("off");
    expect(changeKind(event(1, "", "RULES_UPDATED"))).toBe("rules");
    expect(changeKind(event(1, "", "FLAG_CREATED", "created flag"))).toBe("created");
    expect(changeKind(event(1, "", "FLAG_DELETED", "deleted flag"))).toBe("deleted");
    expect(changeKind(event(1, "", "FLAG_UPDATED", "description changed"))).toBe("description");
  });
});

describe("groupByDay", () => {
  const now = new Date(2026, 10, 14, 15, 0);

  it("groups newest-first events under Today, Yesterday and dates", () => {
    const groups = groupByDay(
      [
        event(5, new Date(2026, 10, 14, 9, 0).toISOString()),
        event(4, new Date(2026, 10, 14, 8, 0).toISOString()),
        event(3, new Date(2026, 10, 13, 22, 0).toISOString()),
        event(2, new Date(2026, 10, 12, 10, 0).toISOString()),
        event(1, new Date(2025, 11, 31, 10, 0).toISOString()),
      ],
      now,
    );

    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Today", [5, 4]],
      ["Yesterday", [3]],
      ["Thu, Nov 12", [2]],
      ["Wed, Dec 31, 2025", [1]],
    ]);
  });
});

describe("highlight", () => {
  it("marks every case-insensitive match", () => {
    expect(highlight("Rollout 5% → 10% rollout", "ROLLOUT")).toEqual([
      { text: "Rollout", match: true },
      { text: " 5% → 10% ", match: false },
      { text: "rollout", match: true },
    ]);
  });

  it("leaves text alone without a query", () => {
    expect(highlight("turned ON", "  ")).toEqual([{ text: "turned ON", match: false }]);
  });
});
