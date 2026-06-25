/**
 * Launcher: resolve a managed server's secrets and exec the real MCP server.
 *
 * This is what the client (Claude Code) actually spawns. The secret exists only
 * in the child process's environment, in memory, for the life of the server —
 * never on disk, never in `~/.claude.json`, never logged.
 */
import { spawn } from "node:child_process";
import { loadRegistry } from "../core/registry.js";
import { requireAdapter } from "../providers/index.js";
import { resolveSecret } from "../core/secrets.js";
import { isSecretRef } from "../config/launcher.js";

export async function runCommand(serverName: string, opts: { registry?: string }): Promise<void> {
  const reg = loadRegistry(opts.registry);
  const server = reg.servers.find((s) => s.name === serverName);
  if (!server) throw new Error(`Server "${serverName}" not found in registry.`);
  const account = reg.accounts.find((a) => a.id === server.account);
  if (!account) throw new Error(`Account "${server.account}" not found for server "${serverName}".`);

  const adapter = requireAdapter(account.provider);
  const cfg = adapter.buildServerConfig(account, server); // env holds secret references

  // Resolve ref-shaped env values at spawn time; literal values pass through.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(cfg.env)) {
    env[k] = isSecretRef(v) ? await resolveSecret(v) : v;
  }

  const child = spawn(cfg.command, cfg.args, { stdio: "inherit", env });
  child.on("error", (err) => {
    // stderr only — no secret material here.
    console.error(`mcpwarden run: failed to start "${serverName}": ${(err as Error).message}`);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}
