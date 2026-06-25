/**
 * mcpwarden — domain model & provider contract.
 *
 * The whole product hangs on the {@link ProviderAdapter} contract: each provider
 * (Supabase, Vercel, Sentry…) plugs in by implementing it. Everything else —
 * registry, config generation, TUI — is provider-agnostic.
 */
import { z } from "zod";

/** Risk domain drives policy defaults and visual treatment. */
export const RiskDomain = z.enum(["client", "internal", "personal"]);
export type RiskDomain = z.infer<typeof RiskDomain>;

export const AuthKind = z.enum(["pat", "oauth", "apikey"]);
export type AuthKind = z.infer<typeof AuthKind>;

/**
 * A secret reference. NEVER a value. Format: `<backend>://<item-id>[#field]`.
 * e.g. `vaultwarden://supabase-pat-gmail`.
 */
export const SecretRef = z
  .string()
  .regex(/^[a-z0-9_-]+:\/\/.+$/, "must be a secret reference like vaultwarden://item, not a value")
  .refine(
    (s) => !/(sbp_|sb_secret|eyJ|service_role|ghp_|sk-)/.test(s),
    "looks like a real secret — registry must hold references only",
  );
export type SecretRef = z.infer<typeof SecretRef>;

export const Account = z.object({
  id: z.string(),
  provider: z.string(), // matches a registered ProviderAdapter.id
  label: z.string(),
  email: z.string().optional(), // displayed name when present (the account's address)
  auth: AuthKind,
  secretRef: SecretRef,
  riskDomain: RiskDomain,
  orgId: z.string().optional(),
  rotationDue: z.string().nullable().optional(),
});
export type Account = z.infer<typeof Account>;

export const ServerPolicy = z.object({
  readOnly: z.boolean(),
  /** `account` = token sees the whole account; `project` = scoped to one resource. */
  projectScope: z.enum(["account", "project"]),
  writeRequiresConfirm: z.boolean().default(true),
});
export type ServerPolicy = z.infer<typeof ServerPolicy>;

/** A resource exposed through a server (a Supabase project, a Vercel project…). */
export const ProviderResource = z.object({
  ref: z.string(),
  name: z.string(),
  status: z.string().optional(),
  region: z.string().optional(),
  clientData: z.boolean().optional(),
  /** provider-specific extras (pg version, RLS coverage…) live here, untyped on purpose. */
  meta: z.record(z.unknown()).optional(),
});
export type ProviderResource = z.infer<typeof ProviderResource>;

export const McpServer = z.object({
  name: z.string(), // the namespaced server id, e.g. "supabase-gmail"
  account: z.string(), // → Account.id
  transport: z.enum(["stdio", "sse", "http"]).default("stdio"),
  command: z.string(),
  policy: ServerPolicy,
  resources: z.array(ProviderResource).default([]),
  /**
   * Exclusive contexts this server belongs to. When a profile is active, only
   * servers tagged with it (or untagged = "always-on") are exposed to the client.
   * Empty = ubiquitous (shown in every context).
   */
  profiles: z.array(z.string()).default([]),
});
export type McpServer = z.infer<typeof McpServer>;

export const Registry = z.object({
  accounts: z.array(Account),
  servers: z.array(McpServer),
});
export type Registry = z.infer<typeof Registry>;

/** The shape of one entry in a client's MCP config (e.g. ~/.claude.json mcpServers). */
export interface McpServerConfig {
  type: "stdio" | "sse" | "http";
  command: string;
  args: string[];
  /** env values are secret REFERENCES at generation time; resolved only at apply time. */
  env: Record<string, string>;
}

export interface HealthResult {
  ok: boolean;
  detail: string;
  tools?: number;
}

/**
 * The plug-in contract. A provider implements config generation (required) and,
 * optionally, live resource discovery and health checks.
 */
export interface ProviderAdapter {
  readonly id: string;
  readonly label: string;
  /** Sensible default policy for a fresh server of this provider. */
  defaultPolicy(): ServerPolicy;
  /** Build the client config entry for a server (env holds secret refs, not values). */
  buildServerConfig(account: Account, server: McpServer): McpServerConfig;
  /** Optional: fetch the resources visible to this account (requires resolved secret). */
  listResources?(account: Account, secret: string): Promise<ProviderResource[]>;
  /** Optional: probe a running server. */
  health?(server: McpServer, secret: string): Promise<HealthResult>;
}
