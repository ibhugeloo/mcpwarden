import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const ACCOUNTS_EXAMPLE = `# mcpwarden — accounts (local, gitignored)
# ZERO secrets here — only vault references. Replace placeholders with your own.
accounts:
  - id: personal
    provider: supabase
    label: personal account
    email: you@example.com
    auth: pat
    secret_ref: vaultwarden://supabase-pat-personal
    risk_domain: personal
    org_id: your-personal-org-id
    rotation_due: null
`;

const SERVERS_EXAMPLE = `# mcpwarden — servers (local, gitignored)
# profiles tags a server with one or more exclusive contexts (untagged = ubiquitous).
servers:
  - name: supabase-personal
    account: personal
    transport: stdio
    command: npx -y @supabase/mcp-server-supabase --read-only
    profiles:
      - personal
    policy:
      read_only: true
      project_scope: account
      write_requires_confirm: true
    projects: []
`;

export function defaultRegistryDir(): string {
  return join(homedir(), ".config", "mcpwarden");
}

export function initCommand(opts: { registry?: string; force?: boolean }): void {
  const dir = opts.registry ?? defaultRegistryDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const created: string[] = [];
  const skipped: string[] = [];
  writeRegistryFile(join(dir, "accounts.yaml"), ACCOUNTS_EXAMPLE, !!opts.force, created, skipped);
  writeRegistryFile(join(dir, "servers.yaml"), SERVERS_EXAMPLE, !!opts.force, created, skipped);

  console.log();
  console.log(`  ${chalk.green("✓")} registry ${chalk.gray(dir)}`);
  if (created.length) console.log(`  ${chalk.green("+ created")} ${created.join(", ")}`);
  if (skipped.length) console.log(`  ${chalk.gray("· kept")}    ${skipped.join(", ")} ${chalk.gray("(use --force to overwrite)")}`);
  console.log();
  console.log(`  ${chalk.gray("next:")} mcpwarden doctor --privacy`);
  console.log(`        mcpwarden profile use personal --apply`);
  console.log();
}

function writeRegistryFile(
  path: string,
  content: string,
  force: boolean,
  created: string[],
  skipped: string[],
): void {
  const name = basename(path);
  if (existsSync(path) && !force) {
    skipped.push(name);
    return;
  }
  writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(path, 0o600);
  created.push(name);
}
