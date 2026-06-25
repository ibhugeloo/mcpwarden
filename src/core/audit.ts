import { loadActiveProfile, type LoadedRegistry } from "./registry.js";
import { serversInProfile } from "./profiles.js";
import type { Account, McpServer, RiskDomain } from "./types.js";

export interface AuditExposure {
  server: string;
  provider: string;
  account: string;
  label: string;
  riskDomain: RiskDomain;
  readOnly: boolean;
  projectScope: "account" | "project";
  profiles: string[];
  resources: number;
  clientDataResources: number;
  secretRef: string;
}

export interface AuditReport {
  registryDir: string;
  activeProfile: string | null;
  exposed: AuditExposure[];
  hidden: string[];
  warnings: string[];
}

export function redactSecretRef(ref: string): string {
  const m = /^([a-z0-9_-]+):\/\//i.exec(ref);
  return m ? `${m[1]}://[redacted]` : "[redacted]";
}

export function buildAuditReport(reg: LoadedRegistry): AuditReport {
  const activeProfile = loadActiveProfile(reg.dir);
  const exposedServers = serversInProfile(reg.servers, activeProfile);
  const exposedNames = new Set(exposedServers.map((s) => s.name));
  const hidden = reg.servers.filter((s) => !exposedNames.has(s.name)).map((s) => s.name).sort();
  const accounts = new Map(reg.accounts.map((a) => [a.id, a]));

  const exposed = exposedServers.map((server) => {
    const account = accounts.get(server.account);
    if (!account) throw new Error(`Server "${server.name}" references missing account "${server.account}".`);
    return exposure(server, account);
  });

  return {
    registryDir: reg.dir,
    activeProfile,
    exposed,
    hidden,
    warnings: auditWarnings(activeProfile, exposed),
  };
}

function exposure(server: McpServer, account: Account): AuditExposure {
  return {
    server: server.name,
    provider: account.provider,
    account: account.id,
    label: account.email ?? account.label,
    riskDomain: account.riskDomain,
    readOnly: server.policy.readOnly,
    projectScope: server.policy.projectScope,
    profiles: server.profiles,
    resources: server.resources.length,
    clientDataResources: server.resources.filter((r) => r.clientData).length,
    secretRef: redactSecretRef(account.secretRef),
  };
}

function auditWarnings(activeProfile: string | null, exposed: AuditExposure[]): string[] {
  const warnings: string[] = [];
  const domains = new Set(exposed.map((e) => e.riskDomain));

  if (!activeProfile && domains.has("client") && domains.size > 1) {
    warnings.push("context all exposes client and non-client accounts; switch to a named profile before applying");
  }

  for (const e of exposed) {
    if (!e.readOnly && e.riskDomain === "client") {
      warnings.push(`${e.server} has WRITE enabled on a client account`);
    }
    if (!e.readOnly && e.clientDataResources > 0) {
      warnings.push(`${e.server} has WRITE enabled while exposing resources marked as client data`);
    }
  }

  if (exposed.length === 0) {
    warnings.push("active context exposes no MCP servers");
  }

  return [...new Set(warnings)];
}
