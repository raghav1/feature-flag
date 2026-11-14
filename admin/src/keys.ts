import type { ApiKey } from "./api";

export type KeyStatus = "active" | "expired" | "revoked";

export function keyStatus(key: ApiKey, now: Date = new Date()): KeyStatus {
  if (key.revokedAt) return "revoked";
  return new Date(key.expiresAt) <= now ? "expired" : "active";
}

/** The MCP server URL agents connect to: this dashboard's address, which proxies /mcp to the backend. */
export function mcpUrl(origin: string): string {
  return `${origin}/mcp`;
}

/** Ready-to-paste command adding this server to Claude Code. */
export function claudeCodeCommand(origin: string, token: string): string {
  return `claude mcp add --transport http feature-flags ${mcpUrl(origin)} --header "Authorization: Bearer ${token}"`;
}

/** Generic MCP client config (Claude Desktop, Cursor, …) for the same server. */
export function mcpJsonConfig(origin: string, token: string): string {
  return JSON.stringify(
    { mcpServers: { "feature-flags": { type: "http", url: mcpUrl(origin), headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );
}
