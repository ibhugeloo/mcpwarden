import chalk from "chalk";
import { loadRegistry } from "../core/registry.js";
import { getAdapter } from "../providers/index.js";
import type { RiskDomain } from "../core/types.js";

const riskColor: Record<RiskDomain, (s: string) => string> = {
  client: chalk.yellow,
  internal: chalk.gray,
  personal: chalk.green,
};

function statusDot(status?: string): string {
  return status === "ACTIVE_HEALTHY" ? chalk.green("●") : chalk.gray("○");
}

export function listCommand(opts: { registry?: string }): void {
  const reg = loadRegistry(opts.registry);

  console.log(chalk.bold("\n  mcpwarden") + chalk.gray(`  ·  registry: ${reg.dir}\n`));

  const byAccount = new Map(reg.accounts.map((a) => [a.id, a]));

  for (const server of reg.servers) {
    const acc = byAccount.get(server.account)!;
    const adapter = getAdapter(acc.provider);
    const risk = riskColor[acc.riskDomain] ?? chalk.white;

    const policy: string[] = [];
    policy.push(server.policy.readOnly ? chalk.green("read-only") : chalk.red("WRITE"));
    policy.push(
      server.policy.projectScope === "account"
        ? chalk.yellow("scope:account")
        : chalk.gray("scope:project"),
    );

    console.log(
      `  ${chalk.bold(server.name)}  ${chalk.gray(`(${adapter ? adapter.label : acc.provider})`)}` +
        `  ${policy.join(" ")}`,
    );
    console.log(
      chalk.gray(`    account ${risk(acc.label)}  ·  ${acc.riskDomain}  ·  secret ${chalk.gray(acc.secretRef)}`),
    );
    if (!adapter) console.log(chalk.red(`    ⚠ no adapter for provider "${acc.provider}"`));

    for (const r of server.resources) {
      const flags = r.clientData ? chalk.yellow(" RGPD") : "";
      const region = r.region ? chalk.gray(` ${r.region}`) : "";
      console.log(
        `    ${statusDot(r.status)} ${r.name}${flags}` +
          chalk.gray(`  ${r.ref.slice(0, 8)}…`) +
          region +
          chalk.gray(`  ${r.status ?? "?"}`),
      );
    }
    console.log();
  }

  const projects = reg.servers.flatMap((s) => s.resources);
  console.log(
    chalk.gray(
      `  ${reg.servers.length} servers · ${reg.accounts.length} accounts · ` +
        `${projects.length} resources · ${projects.filter((p) => p.status === "ACTIVE_HEALTHY").length} active\n`,
    ),
  );
}
