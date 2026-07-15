#!/usr/bin/env node
import { Command } from "commander";
import { listCommand } from "./commands/list.js";
import { doctorCommand } from "./commands/doctor.js";
import { generateCommand } from "./commands/generate.js";
import { serveCommand } from "./commands/serve.js";
import { runCommand } from "./commands/run.js";
import { addCommand } from "./commands/add.js";
import { applyCommand } from "./commands/apply.js";
import { rollbackCommand } from "./commands/rollback.js";
import { auditCommand } from "./commands/audit.js";
import { initCommand } from "./commands/init.js";
import { releaseCheckCommand } from "./commands/release-check.js";
import { profileListCommand, profileUseCommand, profileShowCommand } from "./commands/profile.js";

const program = new Command();

program
  .name("mcpwarden")
  .description("Manage multi-account MCP servers across providers — local-first, secret-safe.")
  .version("0.0.0")
  .option("-r, --registry <dir>", "registry directory (default: ~/.config/mcpwarden)");

program
  .command("init")
  .description("create a local registry in ~/.config/mcpwarden")
  .option("--force", "overwrite existing registry files")
  .action((cmdOpts) => initCommand({ ...program.opts(), ...cmdOpts }));

program
  .command("list")
  .alias("ls")
  .description("list every account, server and resource with its policy")
  .action(() => listCommand(program.opts()));

program
  .command("doctor")
  .description("validate the registry, secret-safety, adapters and policy sanity")
  .option("--privacy", "run stricter pre-publication privacy checks")
  .option("--fix", "fix safe local issues such as registry file permissions")
  .action((cmdOpts) => doctorCommand({ ...program.opts(), ...cmdOpts }));

program
  .command("generate")
  .alias("gen")
  .description("emit the MCP config from the registry (dry-run)")
  .option("-t, --target <client>", "target client", "claude")
  .action((cmdOpts) => generateCommand({ ...program.opts(), ...cmdOpts }));

program
  .command("audit")
  .description("show what the active context exposes to MCP clients")
  .option("--json", "emit machine-readable JSON")
  .option("--format <format>", "output format: text, json, markdown")
  .option("-o, --output <file>", "write audit output to a file (defaults to markdown format)")
  .action((cmdOpts) => auditCommand({ ...program.opts(), ...cmdOpts }));

program
  .command("release-check")
  .description("run the v0.1 public-release readiness gate")
  .action(() => releaseCheckCommand());

// profile — manage the active context (the exclusive set of exposed servers)
const profile = program
  .command("profile")
  .description("manage the active context (which servers Claude Code sees)");
profile
  .command("list", { isDefault: true })
  .description("list profiles and the active context")
  .action(() => profileListCommand(program.opts()));
const profileUse = profile
  .command("use <name>")
  .description('switch active context (a profile name, or "all"/"none" to clear)')
  .option("--apply", "reconcile ~/.claude.json immediately after switching");
profileUse.action((name) => profileUseCommand(name, { ...program.opts(), ...profileUse.opts() }));
profile
  .command("show [name]")
  .description("show the servers in a context (default: active)")
  .action((name) => profileShowCommand(name, program.opts()));

const add = program
  .command("add <provider> <account>")
  .description("register a server, validate it live, and optionally push it to Claude Code")
  .requiredOption("--secret <ref>", "secret reference (e.g. vaultwarden://supabase/acme)")
  .option("--profile <name>", "tag the server with a context")
  .option("--no-readonly", "allow writes (default: read-only)")
  .option("--apply", "reconcile ~/.claude.json immediately after adding");
add.action((provider, account) => addCommand(provider, account, { ...program.opts(), ...add.opts() }));

const apply = program
  .command("apply")
  .description("reconcile the active context into ~/.claude.json, with backup")
  .option("--no-check", "skip the secret-reachability preflight (faster, no vault contact)")
  .option("--dry-run", "show the plan without writing");
apply.action(() => applyCommand({ ...program.opts(), ...apply.opts() }));

const rollback = program
  .command("rollback")
  .description("restore ~/.claude.json from the most recent mcpwarden backup")
  .option("--dry-run", "show what would be restored without writing");
rollback.action(() => rollbackCommand({ ...program.opts(), ...rollback.opts() }));

program
  .command("run <server>")
  .description("resolve secrets and launch a managed MCP server (used by the client config)")
  .action((server) => runCommand(server, program.opts()));

program
  .command("serve")
  .description("serve the local web dashboard from the registry")
  .option("-p, --port <port>", "port", "4173")
  .option("--host <host>", "bind host", "127.0.0.1")
  .option("--allow-remote", "allow non-loopback binds such as 0.0.0.0")
  .action((cmdOpts) => serveCommand({ ...program.opts(), ...cmdOpts }));

program.parseAsync().catch((e) => {
  console.error(`\n  ✗ ${(e as Error).message}\n`);
  process.exitCode = 1;
});
