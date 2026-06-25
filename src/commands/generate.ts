import chalk from "chalk";
import { loadRegistry } from "../core/registry.js";
import { generateClaudeConfig } from "../config/generators.js";

/**
 * Emit the MCP config from the registry. Dry-run by default: prints JSON with
 * secret REFERENCES in env (safe to read). `--apply` (later milestone) will resolve
 * refs and merge into the target client config.
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
  console.log(chalk.gray("  # env values are secret references, resolved only on --apply\n"));
  console.log(JSON.stringify(config, null, 2));
  console.log();
}
