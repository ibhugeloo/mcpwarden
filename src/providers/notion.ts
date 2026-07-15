/** Notion provider adapter — official @notionhq/notion-mcp-server (stdio, env-secret). */
import type {
  Account,
  HealthResult,
  McpServer,
  McpServerConfig,
  ProviderAdapter,
  ServerPolicy,
} from "../core/types.js";

function splitCommand(cmd: string): { command: string; args: string[] } {
  const [command, ...args] = cmd.trim().split(/\s+/);
  return { command: command ?? "npx", args };
}

export const notionAdapter: ProviderAdapter = {
  id: "notion",
  label: "Notion",

  defaultPolicy(): ServerPolicy {
    // Effective write access is capped by the Notion integration's capabilities;
    // the policy still gates what mcpwarden is willing to expose.
    return { readOnly: true, projectScope: "account", writeRequiresConfirm: true };
  },

  buildServerConfig(account: Account, server: McpServer): McpServerConfig {
    const { command, args } = splitCommand(server.command);
    // env holds the REFERENCE at generation time; resolved only when applied.
    return {
      type: server.transport,
      command,
      args,
      env: { NOTION_TOKEN: account.secretRef },
    };
  },

  async health(_server: McpServer, secret: string): Promise<HealthResult> {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Notion-Version": "2022-06-28",
      },
    });
    return res.ok
      ? { ok: true, detail: "Notion API reachable" }
      : { ok: false, detail: `Notion API ${res.status}` };
  },
};
