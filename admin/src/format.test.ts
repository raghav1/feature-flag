import { describe, expect, it } from "vitest";
import { ago } from "./format";

describe("ago", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it.each([
    ["2026-01-01T11:59:50Z", "just now"],
    ["2026-01-01T11:58:00Z", "2 min ago"],
    ["2026-01-01T09:00:00Z", "3 h ago"],
    ["2025-12-28T12:00:00Z", "4 d ago"],
    ["2026-01-01T12:00:30Z", "just now"],
  ])("%s → %s", (iso, expected) => {
    expect(ago(iso, now)).toBe(expected);
  });
});
