/**
 * Config generation: registry → client MCP config.
 *
 * The generated entries contain NO secret and NO secret reference. Each one is a
 * launcher call — `mcpwarden run <server>` with an empty env. `mcpwarden run`
 * resolves the secret from the vault at spawn time and injects it into the real
 * server's environment only. This keeps `~/.claude.json` safe to inspect, diff,
 * back up, and share: a leak of the file leaks nothing.
 */
import type { McpServerConfig, Registry } from "../core/types.js";
import { requireAdapter } from "../providers/index.js";
import { launcherInvocation } from "./launcher.js";

export interface ClaudeMcpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export function generateClaudeConfig(registry: Registry): ClaudeMcpConfig {
  const accounts = new Map(registry.accounts.map((a) => [a.id, a]));
  const mcpServers: Record<string, McpServerConfig> = {};
  const { command, argsPrefix } = launcherInvocation();

  for (const server of registry.servers) {
    const account = accounts.get(server.account);
    if (!account) continue; // integrity already enforced at load
    requireAdapter(account.provider); // validate the provider is supported
    mcpServers[server.name] = {
      type: server.transport,
      command,
      args: [...argsPrefix, "run", server.name],
      env: {}, // zero secret — the launcher resolves at spawn time
    };
  }

  return { mcpServers };
}
