/** `apply` — reconcile the registry's ACTIVE PROFILE into ~/.claude.json. */
import chalk from "chalk";
import { loadRegistry } from "../core/registry.js";
import { applyToClaude } from "../config/apply.js";

function stamp(): string {
  // ISO without ms/colons → filesystem-safe backup suffix.
  return new Date().toISOString().replace(/\.\d+Z$/, "Z").replace(/[:.]/g, "-");
}

export async function applyCommand(opts: {
  registry?: string;
  check?: boolean;
  dryRun?: boolean;
}): Promise<void> {
  const reg = loadRegistry(opts.registry);
  const r = await applyToClaude(reg, stamp(), { check: opts.check !== false, dryRun: opts.dryRun });

  const list = (xs: string[]) => xs.join(", ");
  const tag = r.dryRun ? chalk.yellow(" (dry-run)") : "";
  console.log("");
  console.log(`  ${chalk.bold("apply")}${tag} → ${chalk.gray(r.path)}`);
  console.log(`  ${chalk.gray(`context: ${r.profile ?? "all (no profile)"}`)}`);
  if (!r.changed) console.log(`  ${chalk.gray("· no change — config already up to date")}`);
  if (r.added.length) console.log(`  ${chalk.green("+ added")}    ${list(r.added)}`);
  if (r.updated.length) console.log(`  ${chalk.green("~ updated")}  ${list(r.updated)}`);
  if (r.removed.length) console.log(`  ${chalk.red("- removed")}  ${list(r.removed)} ${chalk.gray("(not in active context)")}`);
  if (r.validated.length) console.log(`  ${chalk.green("✓ secret")}   ${list(r.validated)}`);
  if (r.unresolved.length) console.log(`  ${chalk.yellow("! secret")}   ${list(r.unresolved)} ${chalk.gray("(unreachable — vault locked or item missing)")}`);
  for (const w of r.warnings) console.log(`  ${chalk.yellow("! warning")}  ${chalk.gray(w)}`);
  if (r.backup) console.log(`  ${chalk.gray(`backup    ${r.backup}`)}`);
  console.log("");
}
