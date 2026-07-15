/** Sentry provider adapter — official @sentry/mcp-server (stdio, env-secret). */
import type {
  Account,
  HealthResult,
  McpServer,
  McpServerConfig,
  ProviderAdapter,
  ProviderResource,
  ServerPolicy,
} from "../core/types.js";

function splitCommand(cmd: string): { command: string; args: string[] } {
  const [command, ...args] = cmd.trim().split(/\s+/);
  return { command: command ?? "npx", args };
}

export const sentryAdapter: ProviderAdapter = {
  id: "sentry",
  label: "Sentry",

  defaultPolicy(): ServerPolicy {
    return { readOnly: true, projectScope: "account", writeRequiresConfirm: true };
  },

  buildServerConfig(account: Account, server: McpServer): McpServerConfig {
    const { command, args } = splitCommand(server.command);
    // env holds the REFERENCE at generation time; resolved only when applied.
    return {
      type: server.transport,
      command,
      args,
      env: { SENTRY_ACCESS_TOKEN: account.secretRef },
    };
  },

  async listResources(account: Account, secret: string): Promise<ProviderResource[]> {
    const res = await fetch("https://sentry.io/api/0/projects/", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) throw new Error(`Sentry API ${res.status}`);
    const projects = (await res.json()) as Array<{
      id: string;
      slug: string;
      name: string;
      status?: string;
      organization?: { slug?: string };
    }>;
    return projects
      .filter((p) => !account.orgId || p.organization?.slug === account.orgId)
      .map((p) => ({
        ref: p.slug,
        name: p.name,
        status: p.status,
        meta: { org: p.organization?.slug },
      }));
  },

  async health(_server: McpServer, secret: string): Promise<HealthResult> {
    const res = await fetch("https://sentry.io/api/0/organizations/", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    return res.ok
      ? { ok: true, detail: "Sentry API reachable" }
      : { ok: false, detail: `Sentry API ${res.status}` };
  },
};
