/**
 * Apply the registry to a client config (Claude Code's ~/.claude.json).
 *
 * SAFETY CONTRACT — this is the only code that writes outside the project:
 *  - backs up the target (timestamped) before any write;
 *  - SURGICAL: only ever touches entries it manages (launcher calls,
 *    `mcpwarden run <name>`); every other key — including the user's own
 *    hand-made MCP servers — is preserved byte-for-byte;
 *  - writes only a LAUNCHER call per server (empty env) — no secret and no secret
 *    reference ever lands in the client config;
 *  - EXCLUSIVE: only the ACTIVE PROFILE's servers are exposed. Managed entries
 *    that belong to another context are removed, so Claude Code sees only the
 *    current context — never the whole fleet;
 *  - writes only when something actually changed (no gratuitous reformat).
 *
 * Secret resolution is NOT part of writing. An opt-in PREFLIGHT resolves each
 * reference once to report reachability; the value is discarded, never written.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { McpServerConfig } from "../core/types.js";
import type { LoadedRegistry } from "../core/registry.js";
import { loadActiveProfile } from "../core/registry.js";
import { serversInProfile } from "../core/profiles.js";
import { generateClaudeConfig } from "./generators.js";
import { launcherInvocation } from "./launcher.js";
import { resolveSecret } from "../core/secrets.js";

export function claudeConfigPath(): string {
  return process.env.MCPWARDEN_CLAUDE_JSON || join(homedir(), ".claude.json");
}

export interface ApplyOptions {
  /** Resolve each secret once to report reachability. Opt-in: contacts the vault
   *  (parallel, bounded). Writing the config never depends on it. */
  check?: boolean;
  /** Compute the plan but write nothing (no backup, no file change). */
  dryRun?: boolean;
}

export interface ApplyResult {
  path: string;
  profile: string | null;
  backup: string | null;
  added: string[];
  updated: string[];
  /** managed entries removed because they aren't in the active profile */
  removed: string[];
  /** servers whose secret resolved during the preflight (reachable) */
  validated: string[];
  /** servers whose secret could NOT be resolved (vault locked, item missing…) */
  unresolved: string[];
  warnings: string[];
  changed: boolean;
  dryRun: boolean;
}

/** True when an existing entry is one mcpwarden wrote (a launcher call). */
function isManagedEntry(entry: McpServerConfig | undefined, launcherCmd: string): boolean {
  return (
    !!entry &&
    Array.isArray(entry.args) &&
    entry.args.length === 2 &&
    entry.args[0] === "run" &&
    (entry.command === launcherCmd || entry.command === "mcpwarden")
  );
}

export async function applyToClaude(
  reg: LoadedRegistry,
  stamp: string,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const path = claudeConfigPath();
  const json: { mcpServers?: Record<string, McpServerConfig> } & Record<string, unknown> =
    existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const existing: Record<string, McpServerConfig> = json.mcpServers ?? {};

  const profile = loadActiveProfile(reg.dir);
  const included = serversInProfile(reg.servers, profile);
  const includedNames = new Set(included.map((s) => s.name));
  const launcherCmd = launcherInvocation().command;
  const accountsById = new Map(reg.accounts.map((a) => [a.id, a]));
  const riskDomains = new Set(included.map((s) => accountsById.get(s.account)?.riskDomain).filter(Boolean));
  const warnings =
    !profile && riskDomains.has("client") && riskDomains.size > 1
      ? ["context all exposes client and non-client accounts; use `mcpwarden profile use <ctx> --apply` for isolation"]
      : [];

  // Generated entries (active profile only) are launcher calls — zero secret.
  const generated = generateClaudeConfig({ accounts: reg.accounts, servers: included }).mcpServers;
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];

  for (const [name, next] of Object.entries(generated)) {
    const prev = existing[name];
    if (JSON.stringify(prev) === JSON.stringify(next)) continue; // no-op
    existing[name] = next;
    (prev ? updated : added).push(name);
  }

  // Exclusivity: drop managed entries that aren't in the active profile. Only
  // launcher-shaped entries we own are ever removed — user entries are untouched.
  for (const name of Object.keys(existing)) {
    if (!includedNames.has(name) && isManagedEntry(existing[name], launcherCmd)) {
      delete existing[name];
      removed.push(name);
    }
  }

  const changed = added.length > 0 || updated.length > 0 || removed.length > 0;

  // Opt-in preflight (active profile only), parallel + bounded. Reporting only.
  const validated: string[] = [];
  const unresolved: string[] = [];
  if (opts.check) {
    await Promise.allSettled(
      included.map(async (server) => {
        const acc = reg.accounts.find((a) => a.id === server.account);
        if (!acc) return;
        try {
          await resolveSecret(acc.secretRef);
          validated.push(server.name);
        } catch {
          unresolved.push(server.name);
        }
      }),
    );
  }

  let backup: string | null = null;
  if (changed && !opts.dryRun) {
    json.mcpServers = existing;
    if (existsSync(path)) {
      backup = `${path}.mcpwarden-bak-${stamp}`;
      copyFileSync(path, backup);
    }
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  }

  return {
    path,
    profile,
    backup,
    added,
    updated,
    removed,
    validated,
    unresolved,
    warnings,
    changed,
    dryRun: !!opts.dryRun,
  };
}
