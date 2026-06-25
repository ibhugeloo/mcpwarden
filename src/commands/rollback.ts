/** `rollback` — restore ~/.claude.json from the most recent mcpwarden backup. */
import { readdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import chalk from "chalk";
import { claudeConfigPath } from "../config/apply.js";

export function rollbackCommand(opts: { dryRun?: boolean }): void {
  const path = claudeConfigPath();
  const dir = dirname(path);
  const prefix = `${basename(path)}.mcpwarden-bak-`;

  const backups = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.startsWith(prefix))
        .sort() // timestamped suffix → lexical sort = chronological
    : [];

  if (!backups.length) {
    console.log(`\n  ${chalk.yellow("no mcpwarden backup found")} for ${chalk.gray(path)}\n`);
    return;
  }

  const latest = backups[backups.length - 1]!;
  const from = join(dir, latest);

  if (opts.dryRun) {
    console.log(`\n  ${chalk.bold("rollback (dry-run)")} would restore:\n  ${chalk.gray(from)}\n  → ${chalk.gray(path)}\n`);
    return;
  }

  copyFileSync(from, path);
  console.log(`\n  ${chalk.green("✓ restored")} ${chalk.gray(path)}\n  ${chalk.gray(`from ${latest}`)}\n`);
}
