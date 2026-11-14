import { describe, expect, it } from "vitest";
import type { ApiKey } from "./api";
import { claudeCodeCommand, keyStatus, mcpJsonConfig } from "./keys";

const key: ApiKey = {
  id: 1,
  name: "release-bot",
  role: "EDITOR",
  prefix: "ffk_abcdefgh",
  createdBy: "admin",
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: "2026-04-01T00:00:00Z",
  lastUsedAt: null,
  revokedAt: null,
  revokedBy: null,
};

describe("keyStatus", () => {
  it("is active until it expires, and revoked wins", () => {
    expect(keyStatus(key, new Date("2026-03-01T00:00:00Z"))).toBe("active");
    expect(keyStatus(key, new Date("2026-04-01T00:00:00Z"))).toBe("expired");
    expect(keyStatus({ ...key, revokedAt: "2026-02-01T00:00:00Z" }, new Date("2026-03-01T00:00:00Z"))).toBe("revoked");
  });
});

describe("connection snippets", () => {
  it("point at this dashboard's /mcp with the bearer token", () => {
    expect(claudeCodeCommand("http://localhost:5173", "ffk_secret")).toBe(
      'claude mcp add --transport http feature-flags http://localhost:5173/mcp --header "Authorization: Bearer ffk_secret"',
    );
    expect(JSON.parse(mcpJsonConfig("https://flags.example", "ffk_secret"))).toEqual({
      mcpServers: {
        "feature-flags": { type: "http", url: "https://flags.example/mcp", headers: { Authorization: "Bearer ffk_secret" } },
      },
    });
  });
});
