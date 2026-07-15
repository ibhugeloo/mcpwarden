# AGENTS.md — working in mcpwarden

Guidance for coding agents (Codex & friends) and contributors working in this repo. The **product direction**
lives in [`docs/VISION.md`](docs/VISION.md) — it is the source of truth; if a change doesn't
serve the thesis there, it waits.

## What this is

A **local-first identity boundary for MCP**. Not a generic "MCP manager" (crowded category).
It manages **namespaced, multi-account MCP servers** for clients like Claude Code, keeps
secrets as **references** in a vault (never on disk), reconciles `~/.claude.json` surgically,
and exposes only the **active context** (exclusive profiles) so the client never sees the
whole fleet at once.

Stack: TypeScript (ESM, Node ≥ 20), commander + chalk (CLI), zod, yaml. Build: tsup.

## Design — read `DESIGN.md` FIRST for any UI work

> [!IMPORTANT]
> **For ANY UI work** (web view `src/web/`, CLI colour/symbol output), the **first** action
> is to read [`./DESIGN.md`](./DESIGN.md) — **before** opening `template.html`, `render.ts`,
> or anything else. Reading the CSS alone is not enough: `DESIGN.md` holds the usage rules and
> bans (accent never decorative, no improvised dark mode, CLI semantics) the code doesn't carry.

- **Don't invent** palette, type, or radius — everything comes from `DESIGN.md` / `:root`.
- Accent = **single sober green** (`--accent`), reserved for active/OK/links. Never decorative.
- No off-palette colour (no blue/purple/indigo). CLI: stick to chalk semantics (green=OK,
  red=error, yellow=warn, gray=meta, bold=emphasis).
- `color-scheme: light` is assumed — no improvised dark mode.
- Missing token / uncovered case → add it to `DESIGN.md` **and** `:root` together (one source
  of truth), never a hardcoded inline hex.

## Architecture (how the pieces fit)

```
registry (YAML, zero secrets)        →  the source of truth
  accounts.yaml   accounts + secret refs (vaultwarden://…)
  servers.yaml    namespaced servers, policy, profile tags
  state.yaml      active profile (local, gitignored)

generate  →  launcher config: `mcpwarden run <server>` with env:{} (NO secret)
apply     →  surgical reconcile of ~/.claude.json (backup, preserve other keys,
             EXCLUSIVE to the active profile — removes managed out-of-context entries)
run       →  the launcher the MCP client actually spawns: resolves vaultwarden:// at spawn,
             injects the secret into the child server's env ONLY, exec's the real server
profiles  →  exclusive contexts; `profile use <ctx>` switches what the client sees
serve     →  local web console (127.0.0.1) mirroring the registry
```

Source layout:
- `src/core/` — domain model (`types.ts`), registry load/save + active-profile state, secrets
  resolver, profiles.
- `src/providers/` — provider adapters (`supabase.ts` is the reference; add one, the CLI picks it up).
- `src/config/` — `generators.ts` (launcher form), `apply.ts` (reconcile), `launcher.ts`.
- `src/commands/` — one file per CLI verb (`add`, `apply`, `profile`, `run`, `rollback`,
  `serve`, `doctor`, `list`, `generate`).
- `src/web/` — `render.ts` + `template.html` (console; template copied to `dist/web/` on build).

## Hard invariants (do not break these)

1. **The registry holds references, never secret values.** `SecretRef` (zod) rejects
   anything that looks like a real token; `doctor` scans the YAML for credential shapes.
2. **No secret ever lands in `~/.claude.json`, logs, process args, or disk.** Generated
   entries are launcher calls with `env:{}`. The secret exists only in the child server's env
   at runtime, resolved by `mcpwarden run`. Never reintroduce resolve-then-write.
3. **`apply` is surgical and exclusive.** It only touches launcher-shaped entries it owns; the
   user's own MCP servers are never modified. It always backs up before writing.
4. **Profiles are exclusive.** The active context is the only set exposed; switching context
   removes the others. Untagged servers are ubiquitous (shown in every context).
5. **Local-first, no cloud dependency** to use the tool itself.

## Privacy — repo goes public (build-in-public)

- **Never commit a real registry.** `registry/accounts.yaml` / `servers.yaml` / `state.yaml`
  are gitignored and stay local. Only the anonymized `*.example.yaml` are committed. To run
  locally from a fresh clone: `cp registry/accounts.example.yaml registry/accounts.yaml` (idem
  servers), or point `--registry`/`MCPWARDEN_REGISTRY`/`~/.config/mcpwarden` at your own.
- No real emails, org IDs, client names, or `vaultwarden://` items that reveal a client.
- Scan before any commit touching registry/docs; when unsure about an outward-facing value,
  leave it out.

## Conventions

- Commit email for this repo: `i.bhugeloo@rt-iut.re` (matches the GitHub account; Vercel-safe).
- Surgical changes: edit the requested scope only; flag adjacent cleanup separately.
- After touching `src/web/template.html` or `render.ts`, restart `serve` (template read at boot).

## Commands

```bash
npm run dev -- <cmd>     # tsx src/cli.ts <cmd>
npm run build            # bundle to dist/cli.js (+ copy web template)
npm run typecheck        # tsc --noEmit

mcpwarden list                      # accounts / servers / policy
mcpwarden doctor                    # registry + secret-safety + policy checks
mcpwarden profile list|use|show     # manage the active context
mcpwarden add <provider> <account> --secret vaultwarden://… [--profile X] [--apply]
mcpwarden apply [--dry-run] [--no-check]
mcpwarden rollback [--dry-run]
mcpwarden serve [--port 4173]       # local web console
mcpwarden run <server>              # launcher (used by the client config; resolves secrets)
```

Vault CLI is configurable: `MCPWARDEN_VAULT_BIN` (default `bw`) + `MCPWARDEN_VAULT_ARGS`
(template with `{item}`/`{field}`). The launcher binary in generated config defaults to
`mcpwarden` on PATH; override with `MCPWARDEN_BIN`.
