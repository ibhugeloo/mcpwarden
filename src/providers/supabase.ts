/** Supabase provider adapter — the reference implementation. */
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

export const supabaseAdapter: ProviderAdapter = {
  id: "supabase",
  label: "Supabase",

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
      env: { SUPABASE_ACCESS_TOKEN: account.secretRef },
    };
  },

  async listResources(account: Account, secret: string): Promise<ProviderResource[]> {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) throw new Error(`Supabase API ${res.status}`);
    const projects = (await res.json()) as Array<{
      id: string;
      name: string;
      status: string;
      region: string;
      organization_id: string;
      database?: { version?: string };
    }>;
    return projects
      .filter((p) => !account.orgId || p.organization_id === account.orgId)
      .map((p) => ({
        ref: p.id,
        name: p.name,
        status: p.status,
        region: p.region,
        meta: { pg: p.database?.version },
      }));
  },

  async health(_server: McpServer, secret: string): Promise<HealthResult> {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    return res.ok
      ? { ok: true, detail: "management API reachable" }
      : { ok: false, detail: `management API ${res.status}` };
  },
};
