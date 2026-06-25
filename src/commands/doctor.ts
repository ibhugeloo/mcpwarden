import chalk from "chalk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegistry } from "../core/registry.js";
import { getAdapter } from "../providers/index.js";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

// Patterns that must never appear in a registry file.
const SECRET_PATTERNS = [/sbp_[A-Za-z0-9]/, /eyJ[A-Za-z0-9_-]{10}/, /service_role/, /ghp_[A-Za-z0-9]/, /sk-[A-Za-z0-9]/];

export function doctorCommand(opts: { registry?: string }): void {
  const checks: Check[] = [];
  let reg;
  try {
    reg = loadRegistry(opts.registry);
    checks.push({ name: "registry loads & validates", ok: true, detail: reg.dir });
  } catch (e) {
    checks.push({ name: "registry loads & validates", ok: false, detail: (e as Error).message });
    report(checks);
    process.exitCode = 1;
    return;
  }

  // secret-safety: scan the raw files for credential-shaped strings
  for (const file of ["accounts.yaml", "servers.yaml"]) {
    const raw = readFileSync(join(reg.dir, file), "utf8");
    const hit = SECRET_PATTERNS.find((re) => re.test(raw));
    checks.push({
      name: `no secret leaked in ${file}`,
      ok: !hit,
      detail: hit ? `matched ${hit}` : undefined,
    });
  }

  // every provider has an adapter
  const providers = new Set(reg.accounts.map((a) => a.provider));
  for (const p of providers) {
    checks.push({ name: `adapter for provider "${p}"`, ok: !!getAdapter(p) });
  }

  // policy sanity: a write-enabled server on client data is a red flag
  const byAccount = new Map(reg.accounts.map((a) => [a.id, a]));
  for (const s of reg.servers) {
    const acc = byAccount.get(s.account)!;
    const risky = !s.policy.readOnly && acc.riskDomain === "client";
    checks.push({
      name: `policy sane for "${s.name}"`,
      ok: !risky,
      detail: risky ? "WRITE enabled on a client account" : undefined,
    });
  }

  report(checks);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

function report(checks: Check[]): void {
  console.log();
  for (const c of checks) {
    const mark = c.ok ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${mark} ${c.name}${c.detail ? chalk.gray(`  — ${c.detail}`) : ""}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(
    "\n  " +
      (failed === 0
        ? chalk.green(`all ${checks.length} checks passed`)
        : chalk.red(`${failed}/${checks.length} checks failed`)) +
      "\n",
  );
}
