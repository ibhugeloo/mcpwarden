/**
 * Registry mutations behind the console actions.
 *
 * These act on the **mcpwarden registry** (the source of truth) — NOT on the live
 * `~/.claude.json`. Pushing to a client config is a separate, explicit step, so a
 * "disconnect" here never breaks the MCP servers of the running session.
 */
import { loadRegistry, saveRegistry } from "./registry.js";
import { SecretRef } from "./types.js";
import { requireAdapter } from "../providers/index.js";

export class ActionError extends Error {}

const slug = (s: string): string =>
  (s.includes("@") ? s.split("@")[0]! : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function commandFor(provider: string): string {
  if (provider === "supabase") return "npx -y @supabase/mcp-server-supabase --read-only";
  throw new ActionError(`Provider "${provider}" pas encore supporté.`);
}

function validRef(ref: string): string {
  const parsed = SecretRef.safeParse(ref.trim());
  if (!parsed.success) {
    throw new ActionError(
      "La référence de secret doit être une référence (ex. vaultwarden://item), jamais un secret en clair.",
    );
  }
  return parsed.data;
}

export interface AddInput {
  provider: string;
  account: string;
  secretRef: string;
  /** optional context tags for the new server */
  profiles?: string[];
  /** read-only policy (default true) */
  readOnly?: boolean;
  /** risk domain for a freshly created account (default "internal") */
  riskDomain?: "client" | "internal" | "personal";
}

export function addService(dir: string | undefined, input: AddInput): { name: string } {
  const provider = input.provider.trim();
  const account = input.account.trim();
  if (!account) throw new ActionError("Le compte est requis.");
  const adapter = requireAdapter(provider); // throws on unknown provider
  const secretRef = validRef(input.secretRef);

  const reg = loadRegistry(dir);
  const id = slug(account);
  if (!id) throw new ActionError("Identifiant de compte invalide.");
  const name = `${provider}-${id}`;
  if (reg.servers.some((s) => s.name === name)) {
    throw new ActionError(`Le service "${name}" existe déjà.`);
  }

  if (!reg.accounts.some((a) => a.id === id)) {
    reg.accounts.push({
      id,
      provider,
      label: account,
      email: account.includes("@") ? account : undefined,
      auth: "pat",
      secretRef,
      riskDomain: input.riskDomain ?? "internal",
      rotationDue: null,
    });
  }
  const policy = adapter.defaultPolicy();
  if (input.readOnly === false) policy.readOnly = false;
  reg.servers.push({
    name,
    account: id,
    transport: "stdio",
    command: commandFor(provider),
    policy,
    resources: [],
    profiles: input.profiles ?? [],
  });

  saveRegistry(reg.dir, reg);
  return { name };
}

export function changeSecret(dir: string | undefined, serviceName: string, ref: string): void {
  const secretRef = validRef(ref);
  const reg = loadRegistry(dir);
  const server = reg.servers.find((s) => s.name === serviceName);
  if (!server) throw new ActionError(`Service "${serviceName}" introuvable.`);
  const account = reg.accounts.find((a) => a.id === server.account);
  if (!account) throw new ActionError(`Compte "${server.account}" introuvable.`);
  account.secretRef = secretRef;
  saveRegistry(reg.dir, reg);
}

export function editService(
  dir: string | undefined,
  serviceName: string,
  input: { email?: string },
): void {
  const reg = loadRegistry(dir);
  const server = reg.servers.find((s) => s.name === serviceName);
  if (!server) throw new ActionError(`Service "${serviceName}" introuvable.`);
  const account = reg.accounts.find((a) => a.id === server.account);
  if (!account) throw new ActionError(`Compte "${server.account}" introuvable.`);

  const email = input.email?.trim();
  if (email !== undefined && email !== "") {
    // never let a token slip into a display field
    if (/^(sbp_|sb_secret|eyJ|service_role|ghp_|sk-)/.test(email)) {
      throw new ActionError("Ce champ attend une adresse e-mail, pas un secret.");
    }
    account.email = email;
    account.label = email; // keep the displayed identity in sync
  }
  saveRegistry(reg.dir, reg);
}

export function disconnectService(dir: string | undefined, serviceName: string): void {
  const reg = loadRegistry(dir);
  const idx = reg.servers.findIndex((s) => s.name === serviceName);
  if (idx < 0) throw new ActionError(`Service "${serviceName}" introuvable.`);
  const accountId = reg.servers[idx]!.account;
  reg.servers.splice(idx, 1);
  // drop the account only if no remaining server uses it
  if (!reg.servers.some((s) => s.account === accountId)) {
    reg.accounts = reg.accounts.filter((a) => a.id !== accountId);
  }
  saveRegistry(reg.dir, reg);
}
