import chalk from "chalk";
import { loadRegistry } from "../core/registry.js";
import { buildAuditReport, type AuditExposure } from "../core/audit.js";

export function auditCommand(opts: { registry?: string; json?: boolean }): void {
  const reg = loadRegistry(opts.registry);
  const report = buildAuditReport(reg);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

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
