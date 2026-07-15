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

export function renderAuditMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  lines.push("# mcpwarden audit report");
  lines.push("");
  lines.push(`- Registry: \`${escapeInlineCode(report.registryDir)}\``);
  lines.push(`- Context: \`${escapeInlineCode(report.activeProfile ?? "all (no profile)")}\``);
  lines.push(`- Exposed servers: ${report.exposed.length}`);
  lines.push(`- Hidden servers: ${report.hidden.length}`);
  lines.push("");

  lines.push("## Warnings");
  lines.push("");
  if (report.warnings.length) {
    for (const warning of report.warnings) lines.push(`- ${escapeMarkdown(warning)}`);
  } else {
    lines.push("- None");
  }
  lines.push("");

  lines.push("## Exposed Servers");
  lines.push("");
  if (report.exposed.length) {
    lines.push(
      "| Server | Provider | Account | Risk | Policy | Scope | Profiles | Resources | Secret Ref |",
    );
    lines.push("|---|---|---|---|---|---|---|---:|---|");
    for (const e of report.exposed) {
      lines.push(
        [
          escapeTable(e.server),
          escapeTable(e.provider),
          escapeTable(e.account),
          escapeTable(e.riskDomain),
          e.readOnly ? "read-only" : "WRITE",
          escapeTable(e.projectScope),
          escapeTable(e.profiles.length ? e.profiles.join(", ") : "ubiquitous"),
          String(e.resources),
          `\`${escapeInlineCode(e.secretRef)}\``,
        ].join(" | ").replace(/^/, "| ") + " |",
      );
    }
  } else {
    lines.push("_No MCP servers exposed in this context._");
  }
  lines.push("");

  lines.push("## Hidden Servers");
  lines.push("");
  if (report.hidden.length) {
    for (const name of report.hidden) lines.push(`- \`${escapeInlineCode(name)}\``);
  } else {
    lines.push("- None");
  }
  lines.push("");
  lines.push("## Secret Safety");
  lines.push("");
  lines.push("- Secret values are not included.");
  lines.push("- Secret references are redacted to backend schemes only.");
  lines.push("- Generated client config should remain launcher-only (`mcpwarden run <server>`).");
  lines.push("");

  return lines.join("\n");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([*_#[\]()!])/g, "\\$1");
}

function escapeTable(value: string): string {
  return escapeMarkdown(value).replace(/\|/g, "\\|");
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, "\\`");
}
