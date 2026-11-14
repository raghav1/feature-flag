import { describe, expect, it } from "vitest";
import { DEMO_USERS, contextFor, readSelection, toSearch } from "./users";

describe("demo users", () => {
  it("sends the customer as an attribute and leaves out what a user doesn't have", () => {
    const ben = DEMO_USERS.find((u) => u.key === "u_207")!;
    const anonymous = DEMO_USERS.find((u) => u.key === "anonymous")!;

    expect(contextFor(ben)).toEqual({ userId: "u_207", attributes: { customer: "acme" } });
    expect(contextFor(anonymous)).toEqual({ attributes: {} });
  });

  it("round-trips the selection through the URL", () => {
    const selection = readSelection("?user=u_303&env=dev");

    expect(selection.user.key).toBe("u_303");
    expect(selection.env).toBe("dev");
    expect(readSelection(toSearch(selection))).toEqual(selection);
  });

  it("falls back to defaults for unknown values", () => {
    const selection = readSelection("?user=nobody&env=staging");

    expect(selection.user.key).toBe("u_207");
    expect(selection.env).toBe("prod");
  });
});
