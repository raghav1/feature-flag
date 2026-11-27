import { describe, expect, it } from "vitest";
import { DEMO_USERS, label, readSelection, sdkUser, toSearch } from "./users";

describe("demo users", () => {
  it("sends the customer and country as attributes and leaves out what a user doesn't have", () => {
    const ben = DEMO_USERS.find((u) => u.key === "u_207")!;
    const eli = DEMO_USERS.find((u) => u.key === "u_412")!;
    const anonymous = DEMO_USERS.find((u) => u.key === "anonymous")!;

    expect(sdkUser(ben)).toEqual({ id: "u_207", attributes: { customer: "acme", country: "CA" } });
    expect(sdkUser(eli)).toEqual({ id: "u_412", attributes: { customer: "zenith" } });
    expect(sdkUser(anonymous)).toEqual({ attributes: {} });
    expect(sdkUser(ben)).toBe(sdkUser(ben));
  });

  it("gives each user the country the seeded free-shipping rule expects", () => {
    const countries = Object.fromEntries(DEMO_USERS.map((u) => [u.name, u.country]));

    expect(countries).toEqual({
      Ana: "US",
      Ben: "CA",
      Cy: "US",
      Dee: "DE",
      Eli: undefined,
      "Anonymous visitor": undefined,
    });
  });

  it("labels users with their customer and country", () => {
    const byKey = (key: string) => DEMO_USERS.find((u) => u.key === key)!;

    expect(label(byKey("u_207"))).toBe("Ben · u_207 (acme, CA)");
    expect(label(byKey("u_102"))).toBe("Ana · u_102 (US)");
    expect(label(byKey("u_412"))).toBe("Eli · u_412 (zenith)");
    expect(label(byKey("anonymous"))).toBe("Anonymous visitor");
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
