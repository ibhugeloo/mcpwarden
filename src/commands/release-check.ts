import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCommand } from "./init.js";
import { doctorCommand } from "./doctor.js";
import { loadRegistry, saveActiveProfile } from "../core/registry.js";
import { generateClaudeConfig } from "../config/generators.js";
import { buildAuditReport } from "../core/audit.js";

interface Gate {
  name: string;
  ok: boolean;
  detail?: string;
}

export function releaseCheckCommand(): void {
  const gates: Gate[] = [];

  gates.push(commandGate("typecheck", "npm", ["run", "typecheck"]));
  gates.push(commandGate("tests", "npm", ["test"]));
  gates.push(commandGate("build", "npm", ["run", "build"]));

  const dir = mkdtempSync(join(tmpdir(), "mcpwarden-release-"));
  silenceConsole(() => initCommand({ registry: dir }));
  gates.push({
    name: "init creates private registry",
    ok: privateMode(join(dir, "accounts.yaml")) && privateMode(join(dir, "servers.yaml")),
    detail: dir,
  });

  silenceConsole(() => doctorCommand({ registry: dir, privacy: true }));
  gates.push({
    name: "doctor --privacy on fresh registry",
    ok: process.exitCode !== 1,
  });
  process.exitCode = 0;

  saveActiveProfile(dir, "personal");
  const activeReg = loadRegistry(dir);
  const generated = JSON.stringify(generateClaudeConfig(activeReg));
  const audit = buildAuditReport(activeReg);
  const generatedHasRefs = generated.includes("vaultwarden://") || generated.includes("env://");
  gates.push({
    name: "generated config is launcher-only",
    ok: generated.includes('"env":{}') && !generatedHasRefs,
    detail: generatedHasRefs ? "generated config contains a secret reference" : undefined,
  });
  gates.push({
    name: "audit redacts secret references",
    ok: !JSON.stringify(audit).includes("supabase-pat-personal"),
  });

  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    bin?: Record<string, string>;
    files?: string[];
    scripts?: Record<string, string>;
  };
  gates.push({
    name: "npm package metadata",
    ok:
      pkg.bin?.mcpwarden === "./dist/cli.js" &&
      Array.isArray(pkg.files) &&
      pkg.files.includes("dist") &&
      !!pkg.scripts?.build,
  });

  report(gates);
  if (gates.some((g) => !g.ok)) process.exitCode = 1;
}

function commandGate(name: string, command: string, args: string[]): Gate {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return { name, ok: true };
  } catch {
    return { name, ok: false };
  }
}

function privateMode(path: string): boolean {
  if (process.platform === "win32") return true;
  return (statSync(path).mode & 0o777) === 0o600;
}

function silenceConsole(fn: () => void): void {
  const log = console.log;
  console.log = () => undefined;
  try {
    fn();
  } finally {
    console.log = log;
  }
}

function report(gates: Gate[]): void {
  console.log();
  console.log(chalk.bold("  release-check"));
  for (const gate of gates) {
    const mark = gate.ok ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${mark} ${gate.name}${gate.detail ? chalk.gray(`  — ${gate.detail}`) : ""}`);
  }
  const failed = gates.filter((g) => !g.ok).length;
  console.log();
  console.log(
    "  " +
      (failed === 0
        ? chalk.green(`all ${gates.length} release gates passed`)
        : chalk.red(`${failed}/${gates.length} release gates failed`)) +
      "\n",
  );
}
