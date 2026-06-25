/**
 * Secret resolution. References → values, at runtime only.
 *
 * Hard rules:
 *  - resolved values are NEVER written to disk and NEVER logged;
 *  - they live in memory just long enough to be injected and are not returned
 *    up the stack except to the single caller that applies them.
 *
 * Backends are pluggable. `vaultwarden://` shells out to the Bitwarden/Vaultwarden
 * CLI; `env://` reads an environment variable (useful for CI). Real Vaultwarden
 * wiring lands in the secret-resolver milestone — this is the contract + a guarded stub.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SecretBackend {
  scheme: string;
  resolve(itemId: string, field?: string): Promise<string>;
}

export class SecretError extends Error {}

function parseRef(ref: string): { scheme: string; item: string; field?: string } {
  const m = /^([a-z0-9_-]+):\/\/([^#]+)(?:#(.+))?$/.exec(ref);
  if (!m) throw new SecretError(`Invalid secret reference: ${ref}`);
  return { scheme: m[1]!, item: m[2]!, field: m[3] };
}

const envBackend: SecretBackend = {
  scheme: "env",
  async resolve(itemId) {
    const v = process.env[itemId];
    if (!v) throw new SecretError(`env var ${itemId} is not set`);
    return v;
  },
};

/**
 * Build the argv that reads a single field from the vault. Generic by design:
 *   - default targets the Bitwarden/Vaultwarden CLI (`bw get <field> <item>`);
 *   - fully overridable for any vault CLI via env, e.g. a wrapper that takes
 *     `<cmd> get <item>`:
 *       MCPWARDEN_VAULT_BIN=jarvis-vaultwarden
 *       MCPWARDEN_VAULT_ARGS=get,{item}
 *     Placeholders {item} and {field} are substituted; {field} defaults to "password".
 */
function vaultArgv(item: string, field?: string): { bin: string; argv: string[] } {
  const bin = process.env.MCPWARDEN_VAULT_BIN || "bw";
  const tmpl = process.env.MCPWARDEN_VAULT_ARGS;
  const f = field || "password";
  if (tmpl) {
    const argv = tmpl
      .split(",")
      .map((a) => a.trim().replace("{item}", item).replace("{field}", f));
    return { bin, argv };
  }
  // Default: Bitwarden CLI. Map our field aliases onto `bw get <what>`.
  const what = !field || field === "password" ? "password" : field === "user" ? "username" : field;
  return { bin, argv: ["get", what, item] };
}

const vaultwardenBackend: SecretBackend = {
  scheme: "vaultwarden",
  async resolve(itemId, field) {
    const { bin, argv } = vaultArgv(itemId, field);
    try {
      // execFile (no shell) → the item id never hits a shell, the value never
      // touches argv of a shell process. We trim and return WITHOUT logging.
      const { stdout } = await execFileAsync(bin, argv, {
        maxBuffer: 1 << 20,
        timeout: 10_000, // bounded: a CLI waiting on stdin is killed, never hangs apply
      });
      const value = stdout.replace(/\r?\n$/, "");
      if (!value) {
        throw new SecretError(`vault returned an empty value for "${itemId}".`);
      }
      return value;
    } catch (err) {
      if (err instanceof SecretError) throw err;
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      if (e.code === "ENOENT") {
        throw new SecretError(
          `vault CLI "${bin}" not found. Set MCPWARDEN_VAULT_BIN (and MCPWARDEN_VAULT_ARGS) ` +
            `to point at your vault command.`,
        );
      }
      // stderr from the CLI carries the error reason (e.g. "locked"), not the secret.
      // Sanitize: strip ANSI/control chars (CLIs like `bw` emit a TTY prompt) and clamp.
      const reason =
        (e.stderr || e.message || "")
          .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
          .replace(/[\x00-\x1f\x7f]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120) || "unknown error";
      throw new SecretError(`could not resolve "${itemId}" from vault: ${reason}`);
    }
  },
};

const backends = new Map<string, SecretBackend>(
  [envBackend, vaultwardenBackend].map((b) => [b.scheme, b]),
);

/** Resolve a single reference to its value. Caller is responsible for not leaking it. */
export async function resolveSecret(ref: string): Promise<string> {
  const { scheme, item, field } = parseRef(ref);
  const backend = backends.get(scheme);
  if (!backend) throw new SecretError(`No secret backend for scheme "${scheme}://"`);
  return backend.resolve(item, field);
}

export function knownSchemes(): string[] {
  return [...backends.keys()];
}
