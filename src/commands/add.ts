/**
 * `add` — the < 60s onboarding: register a server, validate it live, and
 * (optionally) push it to Claude Code in a single command.
 *
 *   mcpwarden add supabase acme \
 *     --secret vaultwarden://supabase/acme --profile acme --readonly --apply
 *
 * Finishes with a clear status: secret resolved · provider reachable · config
 * reconciled · rollback available. Validation is best-effort and never blocks
 * the registry write — a not-yet-stored secret is reported, not fatal.
 */
import chalk from "chalk";
import { loadRegistry } from "../core/registry.js";
import { addService } from "../core/actions.js";
import { resolveSecret } from "../core/secrets.js";
import { requireAdapter } from "../providers/index.js";
import { applyCommand } from "./apply.js";

interface AddOpts {
  registry?: string;
  secret?: string;
  profile?: string;
  readonly?: boolean; // commander: --readonly / --no-readonly
  apply?: boolean;
}

const ok = (k: string, d: string) => console.log(`  ${chalk.green("✓")} ${k.padEnd(10)}${chalk.gray(d)}`);
const warn = (k: string, d: string) => console.log(`  ${chalk.yellow("!")} ${k.padEnd(10)}${chalk.gray(d)}`);

export async function addCommand(provider: string, account: string, opts: AddOpts): Promise<void> {
  if (!opts.secret) {
    throw new Error("--secret <ref> is required (e.g. vaultwarden://supabase/acme).");
  }

  const readOnly = opts.readonly !== false;
  const { name } = addService(opts.registry, {
    provider,
    account,
    secretRef: opts.secret,
    profiles: opts.profile ? [opts.profile] : [],
    readOnly,
  });

  console.log("");
  console.log(
    `  ${chalk.bold("+ registry")}  ${name} ${chalk.gray(
      `(account ${account}${opts.profile ? `, context ${opts.profile}` : ""}, ${readOnly ? "read-only" : "WRITE"})`,
    )}`,
  );

  // ── live validation (best-effort) ───────────────────────────────────────
  let secret: string | null = null;
  try {
    secret = await resolveSecret(opts.secret);
    ok("secret", "resolved from vault");
  } catch (e) {
    warn("secret", `${(e as Error).message} — store it, then re-run validation`);
  }

  if (secret) {
    const adapter = requireAdapter(provider);
    if (adapter.health) {
      try {
        const reg = loadRegistry(opts.registry);
        const server = reg.servers.find((s) => s.name === name)!;
        const h = await adapter.health(server, secret);
        (h.ok ? ok : warn)(provider, h.detail);
      } catch (e) {
        warn(provider, (e as Error).message);
      }
    }
  }
  secret = null; // drop the resolved value

  // ── push to the client ──────────────────────────────────────────────────
  if (opts.apply) {
    await applyCommand({ registry: opts.registry, check: false });
    console.log(`  ${chalk.gray("↩ rollback   mcpwarden rollback")}\n`);
  } else {
    console.log(`\n  ${chalk.gray("next: ")}mcpwarden apply ${chalk.gray("→ push to Claude Code")}\n`);
  }
}
