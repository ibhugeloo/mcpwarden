/**
 * How a client's MCP config should invoke mcpwarden's own launcher.
 *
 * The whole point of the launcher indirection: the generated `~/.claude.json`
 * entry runs `mcpwarden run <server>` with an EMPTY env. No secret, no secret
 * reference, nothing sensitive lands in the client config. `mcpwarden run`
 * resolves the secret from the vault at spawn time and injects it into the
 * child server's environment only.
 *
 * Default assumes `mcpwarden` is on PATH (global install / `npm link`).
 * Override the binary with MCPWARDEN_BIN when it is not (must be a resolvable
 * command — no shell is involved).
 */
export function launcherInvocation(): { command: string; argsPrefix: string[] } {
  const bin = process.env.MCPWARDEN_BIN;
  if (bin) return { command: bin, argsPrefix: [] };
  return { command: "mcpwarden", argsPrefix: [] };
}

/** True when a value is a secret reference (`scheme://…`) rather than a literal. */
export function isSecretRef(v: string): boolean {
  return /^[a-z0-9_-]+:\/\/.+/.test(v);
}
