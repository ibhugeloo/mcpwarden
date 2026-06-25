import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { loadRegistry } from "../core/registry.js";
import { getAdapter } from "../providers/index.js";
import { generateClaudeConfig } from "../config/generators.js";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

// Patterns that must never appear in a registry file.
const SECRET_PATTERNS = [/sbp_[A-Za-z0-9]/, /eyJ[A-Za-z0-9_-]{10}/, /service_role/, /ghp_[A-Za-z0-9]/, /sk-[A-Za-z0-9]/];
const SECRET_REF_PATTERN = /[a-z0-9_-]+:\/\/[^\s"',)]+/i;
const SECRET_SCAN_ALLOWLIST = new Set([
  "src/commands/doctor.ts",
  "src/core/actions.ts",
  "src/core/types.ts",
]);

export function doctorCommand(opts: { registry?: string; privacy?: boolean; fix?: boolean }): void {
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

  const fixes = opts.fix ? fixPrivacyIssues(reg) : [];

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

  if (opts.privacy || opts.fix) {
    checks.push(...privacyChecks(reg));
  }

  report(checks);
  if (fixes.length) {
    console.log(chalk.gray(`  fixed: ${fixes.join(", ")}\n`));
  }
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

function registryFiles(reg: ReturnType<typeof loadRegistry>): string[] {
  return ["accounts.yaml", "servers.yaml", "state.yaml"]
    .map((f) => join(reg.dir, f))
    .filter((p) => existsSync(p));
}

function privacyChecks(reg: ReturnType<typeof loadRegistry>): Check[] {
  const checks: Check[] = [];

  for (const file of registryFiles(reg)) {
    const mode = statSync(file).mode & 0o777;
    const ok = process.platform === "win32" || (mode & 0o077) === 0;
    checks.push({
      name: `private permissions for ${basename(file)}`,
      ok,
      detail: ok ? undefined : `mode ${mode.toString(8)}; run chmod 600 ${file}`,
    });
  }

  const trackedSensitive = gitTracked([
    "registry/accounts.yaml",
    "registry/servers.yaml",
    "registry/state.yaml",
    ".env",
    ".env.local",
  ]);
  checks.push({
    name: "real registry/env files are not git-tracked",
    ok: trackedSensitive.length === 0,
    detail: trackedSensitive.length ? trackedSensitive.join(", ") : undefined,
  });

  const generated = JSON.stringify(generateClaudeConfig(reg));
  const generatedHasSecretRef = SECRET_REF_PATTERN.test(generated);
  const generatedHasSecretShape = SECRET_PATTERNS.some((re) => re.test(generated));
  checks.push({
    name: "generated client config contains no secret refs or values",
    ok: !generatedHasSecretRef && !generatedHasSecretShape,
    detail: generatedHasSecretRef
      ? "matched a secret reference"
      : generatedHasSecretShape
        ? "matched a credential-shaped string"
        : undefined,
  });

  const hits = scanProjectForSecrets(process.cwd());
  checks.push({
    name: "working tree has no credential-shaped strings",
    ok: hits.length === 0,
    detail: hits.length ? hits.slice(0, 5).join(", ") : undefined,
  });

  return checks;
}

function fixPrivacyIssues(reg: ReturnType<typeof loadRegistry>): string[] {
  if (process.platform === "win32") return [];
  const fixed: string[] = [];
  for (const file of registryFiles(reg)) {
    const mode = statSync(file).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      chmodSync(file, 0o600);
      fixed.push(`${basename(file)} permissions`);
    }
  }
  return fixed;
}

function gitTracked(paths: string[]): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "--", ...paths], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function scanProjectForSecrets(root: string): string[] {
  const skipDirs = new Set([".git", "node_modules", "dist"]);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const path = join(dir, entry.name);
      const rel = relative(root, path);
      if (rel === "package-lock.json") continue;
      if (SECRET_SCAN_ALLOWLIST.has(rel)) continue;
      let raw = "";
      try {
        raw = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      const hit = SECRET_PATTERNS.find((re) => re.test(raw));
      if (hit) hits.push(`${rel} (${hit})`);
    }
  };
  walk(root);
  return hits;
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
