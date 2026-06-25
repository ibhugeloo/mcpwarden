import chalk from "chalk";
import { loadRegistry } from "../core/registry.js";
import { generateClaudeConfig } from "../config/generators.js";

/**
 * Emit the MCP config from the registry. Dry-run by default: prints launcher
 * entries only (`mcpwarden run <server>`) with empty env. Secrets are resolved
 * later by the launcher, never by generated client config.
 */
export function generateCommand(opts: { registry?: string; target: string }): void {
  const reg = loadRegistry(opts.registry);

  if (opts.target !== "claude") {
    console.error(chalk.red(`Unknown target "${opts.target}". Supported: claude.`));
    process.exitCode = 1;
    return;
  }

  const config = generateClaudeConfig(reg);
  console.log(chalk.gray(`\n  # ${opts.target} — generated from ${reg.dir}`));
  console.log(chalk.gray("  # launcher entries only; env is empty and contains no secret refs\n"));
  console.log(JSON.stringify(config, null, 2));
  console.log();
}
