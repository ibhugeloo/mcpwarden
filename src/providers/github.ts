/** GitHub provider adapter — official GitHub MCP server via Docker. */
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
  return { command: command ?? "docker", args };
}

export const githubAdapter: ProviderAdapter = {
  id: "github",
  label: "GitHub",

  defaultPolicy(): ServerPolicy {
    return { readOnly: true, projectScope: "account", writeRequiresConfirm: true };
  },

  buildServerConfig(account: Account, server: McpServer): McpServerConfig {
    const { command, args } = splitCommand(server.command);
    const env: Record<string, string> = {
      GITHUB_PERSONAL_ACCESS_TOKEN: account.secretRef,
    };
    const finalArgs = [...args];

    if (server.policy.readOnly) {
      const imageIdx = finalArgs.findIndex((a) => a === "ghcr.io/github/github-mcp-server");
      const insertAt = imageIdx >= 0 ? imageIdx : finalArgs.length;
      finalArgs.splice(insertAt, 0, "-e", "GITHUB_READ_ONLY");
      env.GITHUB_READ_ONLY = "1";
    }

    return {
      type: server.transport,
      command,
      args: finalArgs,
      env,
    };
  },

  async health(_server: McpServer, secret: string): Promise<HealthResult> {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mcpwarden",
      },
    });
    return res.ok
      ? { ok: true, detail: "GitHub API reachable" }
      : { ok: false, detail: `GitHub API ${res.status}` };
  },
};
