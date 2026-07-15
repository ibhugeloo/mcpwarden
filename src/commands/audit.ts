import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { loadRegistry } from "../core/registry.js";
import { buildAuditReport, renderAuditMarkdown, type AuditExposure, type AuditReport } from "../core/audit.js";

type AuditFormat = "text" | "json" | "markdown";

export function auditCommand(opts: {
  registry?: string;
  json?: boolean;
  format?: string;
  output?: string;
}): void {
  const reg = loadRegistry(opts.registry);
  const report = buildAuditReport(reg);
  const format = resolveFormat(opts);

  if (opts.output) {
    const body = renderAudit(report, format === "text" ? "markdown" : format);
    writeFileSync(opts.output, body.endsWith("\n") ? body : `${body}\n`, "utf8");
    console.log(`\n  ${chalk.green("✓")} audit written ${chalk.gray(opts.output)}\n`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (format === "markdown") {
    console.log(renderAuditMarkdown(report));
    return;
  }

  renderAuditText(report);
}

function resolveFormat(opts: { json?: boolean; format?: string; output?: string }): AuditFormat {
  if (opts.json) return "json";
  if (!opts.format) return opts.output ? "markdown" : "text";
  if (opts.format === "text" || opts.format === "json" || opts.format === "markdown") {
    return opts.format;
  }
  throw new Error(`Unknown audit format "${opts.format}". Supported: text, json, markdown.`);
}

function renderAudit(report: AuditReport, format: AuditFormat): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "markdown") return renderAuditMarkdown(report);
  return renderAuditPlain(report);
}

function renderAuditText(report: AuditReport): void {
  console.log();
  console.log(`${chalk.bold("  audit")} ${chalk.gray(`— registry: ${report.registryDir}`)}`);
  console.log(`  ${chalk.gray(`context: ${report.activeProfile ?? "all (no profile)"}`)}`);
  console.log(
    `  ${chalk.gray(
      `${report.exposed.length} exposed · ${report.hidden.length} hidden · ${riskSummary(report.exposed)}`,
    )}`,
  );

  if (report.warnings.length) {
    console.log();
    for (const warning of report.warnings) {
      console.log(`  ${chalk.yellow("!")} ${warning}`);
    }
  }

  console.log();
  for (const e of report.exposed) {
    const policy = e.readOnly ? chalk.green("read-only") : chalk.red("WRITE");
    const scope = e.projectScope === "project" ? chalk.gray("scope:project") : chalk.yellow("scope:account");
    const tags = e.profiles.length ? `[${e.profiles.join(", ")}]` : "[ubiquitous]";
    console.log(`  ${chalk.bold(e.server)}  ${chalk.gray(`(${e.provider})`)}  ${policy} ${scope}`);
    console.log(
      `    ${riskLabel(e)} ${chalk.gray(`· account ${e.account} · ${tags} · secret ${e.secretRef}`)}`,
    );
    console.log(
      `    ${chalk.gray(
        `${e.resources} resources · ${e.clientDataResources} marked client-data`,
      )}`,
    );
  }

  if (!report.exposed.length) {
    console.log(`  ${chalk.gray("(no exposed servers)")}`);
  }

  if (report.hidden.length) {
    console.log();
    console.log(`  ${chalk.gray(`hidden: ${report.hidden.join(", ")}`)}`);
  }
  console.log();
}

function renderAuditPlain(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`audit — registry: ${report.registryDir}`);
  lines.push(`context: ${report.activeProfile ?? "all (no profile)"}`);
  lines.push(`${report.exposed.length} exposed · ${report.hidden.length} hidden · ${riskSummary(report.exposed)}`);
  if (report.warnings.length) {
    lines.push("");
    for (const warning of report.warnings) lines.push(`! ${warning}`);
  }
  lines.push("");
  for (const e of report.exposed) {
    const policy = e.readOnly ? "read-only" : "WRITE";
    const scope = e.projectScope === "project" ? "scope:project" : "scope:account";
    const tags = e.profiles.length ? `[${e.profiles.join(", ")}]` : "[ubiquitous]";
    lines.push(`${e.server} (${e.provider}) ${policy} ${scope}`);
    lines.push(`  ${e.label} · account ${e.account} · ${tags} · secret ${e.secretRef}`);
    lines.push(`  ${e.resources} resources · ${e.clientDataResources} marked client-data`);
  }
  if (!report.exposed.length) lines.push("(no exposed servers)");
  if (report.hidden.length) {
    lines.push("");
    lines.push(`hidden: ${report.hidden.join(", ")}`);
  }
  return lines.join("\n");
}

function riskLabel(e: AuditExposure): string {
  if (e.riskDomain === "client") return chalk.yellow(e.label);
  if (e.riskDomain === "personal") return chalk.green(e.label);
  return chalk.gray(e.label);
}

function riskSummary(exposed: AuditExposure[]): string {
  const counts = new Map<string, number>();
  for (const e of exposed) counts.set(e.riskDomain, (counts.get(e.riskDomain) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ");
}
