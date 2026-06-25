/**
 * Registry loading & validation.
 *
 * The registry is two YAML files (accounts.yaml, servers.yaml). It is the single
 * source of truth and holds ZERO secrets — only references. Resolution order:
 *   1. --registry <dir> flag
 *   2. $MCPWARDEN_REGISTRY
 *   3. ~/.config/mcpwarden/
 *   4. ./registry  (repo-local example, for dev)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { Account, McpServer, Registry, ServerPolicy } from "./types.js";

export class RegistryError extends Error {}

function resolveRegistryDir(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.MCPWARDEN_REGISTRY,
    join(homedir(), ".config", "mcpwarden"),
    resolve(process.cwd(), "registry"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (existsSync(join(dir, "accounts.yaml")) && existsSync(join(dir, "servers.yaml"))) {
      return dir;
    }
  }
  throw new RegistryError(
    `No registry found. Looked in:\n  ${candidates.join("\n  ")}\n` +
      `Create accounts.yaml + servers.yaml in ~/.config/mcpwarden/.`,
  );
}

// YAML uses snake_case for ergonomics; map to the camelCase domain model.
const AccountYaml = z
  .object({
    id: z.string(),
    provider: z.string(),
    label: z.string(),
    email: z.string().optional(),
    auth: z.string(),
    secret_ref: z.string(),
    risk_domain: z.string(),
    org_id: z.string().optional(),
    rotation_due: z.string().nullable().optional(),
  })
  .transform((a) => ({
    id: a.id,
    provider: a.provider,
    label: a.label,
    email: a.email,
    auth: a.auth,
    secretRef: a.secret_ref,
    riskDomain: a.risk_domain,
    orgId: a.org_id,
    rotationDue: a.rotation_due ?? null,
  }));

const ServerYaml = z
  .object({
    name: z.string(),
    account: z.string(),
    transport: z.string().default("stdio"),
    command: z.string(),
    policy: z.object({
      read_only: z.boolean(),
      project_scope: z.enum(["account", "project"]),
      write_requires_confirm: z.boolean().default(true),
    }),
    profiles: z.array(z.string()).default([]),
    projects: z
      .array(
        z.object({
          ref: z.string(),
          name: z.string(),
          status: z.string().optional(),
          region: z.string().optional(),
          client_data: z.boolean().optional(),
          alias: z.string().optional(),
          pg: z.string().optional(),
          rls: z.string().optional(),
          tables: z.array(z.string()).optional(),
        }),
      )
      .default([]),
  })
  .transform((s) => ({
    name: s.name,
    account: s.account,
    transport: s.transport,
    command: s.command,
    profiles: s.profiles,
    policy: {
      readOnly: s.policy.read_only,
      projectScope: s.policy.project_scope,
      writeRequiresConfirm: s.policy.write_requires_confirm,
    },
    resources: s.projects.map((p) => ({
      ref: p.ref,
      name: p.name,
      status: p.status,
      region: p.region,
      clientData: p.client_data,
      meta: { alias: p.alias, pg: p.pg, rls: p.rls, tables: p.tables },
    })),
  }));

export interface LoadedRegistry extends Registry {
  dir: string;
}

export function loadRegistry(explicit?: string): LoadedRegistry {
  const dir = resolveRegistryDir(explicit);
  const accountsRaw = parse(readFileSync(join(dir, "accounts.yaml"), "utf8"))?.accounts ?? [];
  const serversRaw = parse(readFileSync(join(dir, "servers.yaml"), "utf8"))?.servers ?? [];

  const accounts = z.array(AccountYaml).parse(accountsRaw).map((a) => Account.parse(a));
  const servers = z.array(ServerYaml).parse(serversRaw).map((s) => ({
    ...s,
    policy: ServerPolicy.parse(s.policy),
    transport: McpServer.shape.transport.parse(s.transport),
  }));

  // referential integrity: every server points at a known account
  const ids = new Set(accounts.map((a) => a.id));
  for (const s of servers) {
    if (!ids.has(s.account)) {
      throw new RegistryError(`Server "${s.name}" references unknown account "${s.account}".`);
    }
  }

  return { dir, accounts, servers: servers.map((s) => McpServer.parse(s)) };
}

const HEADER_ACCOUNTS =
  "# mcpwarden — accounts (managed by mcpwarden; edits may be overwritten)\n" +
  "# ZERO secrets here — only Vaultwarden/env references.\n";
const HEADER_SERVERS = "# mcpwarden — servers (managed by mcpwarden; edits may be overwritten)\n";

const dropUndefined = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Serialize the registry back to YAML (camelCase model → snake_case files). */
export function saveRegistry(dir: string, reg: Registry): void {
  const accounts = reg.accounts.map((a) =>
    dropUndefined({
      id: a.id,
      provider: a.provider,
      label: a.label,
      email: a.email,
      auth: a.auth,
      secret_ref: a.secretRef,
      risk_domain: a.riskDomain,
      org_id: a.orgId,
      rotation_due: a.rotationDue ?? null,
    }),
  );
  const servers = reg.servers.map((s) =>
    dropUndefined({
    name: s.name,
    account: s.account,
    transport: s.transport,
    command: s.command,
    profiles: s.profiles.length ? s.profiles : undefined,
    policy: {
      read_only: s.policy.readOnly,
      project_scope: s.policy.projectScope,
      write_requires_confirm: s.policy.writeRequiresConfirm,
    },
    projects: s.resources.map((r) =>
      dropUndefined({
        ref: r.ref,
        name: r.name,
        status: r.status,
        region: r.region,
        client_data: r.clientData,
        alias: r.meta?.alias as string | undefined,
        pg: r.meta?.pg as string | undefined,
        rls: r.meta?.rls as string | undefined,
        tables: r.meta?.tables as string[] | undefined,
      }),
    ),
  }));
  writeFileSync(join(dir, "accounts.yaml"), HEADER_ACCOUNTS + stringify({ accounts }), "utf8");
  writeFileSync(join(dir, "servers.yaml"), HEADER_SERVERS + stringify({ servers }), "utf8");
}

/**
 * Active-profile state lives next to the registry (state.yaml), out of the
 * canonical YAML and out of git. null = no profile active (all servers exposed).
 */
export function loadActiveProfile(dir: string): string | null {
  const p = join(dir, "state.yaml");
  if (!existsSync(p)) return null;
  const s = (parse(readFileSync(p, "utf8")) ?? {}) as { active_profile?: string | null };
  return s.active_profile ?? null;
}

export function saveActiveProfile(dir: string, name: string | null): void {
  writeFileSync(
    join(dir, "state.yaml"),
    "# mcpwarden — local state (not canonical, gitignored)\n" + stringify({ active_profile: name }),
    "utf8",
  );
}
