# mcpwarden

> Local-first CLI/TUI to manage **multi-account MCP servers** across providers — secret-safe by design.

Most MCP clients (Claude, Cursor…) bind **one account per connector** via OAuth. The moment you have two Supabase accounts, a personal + a client Vercel, or several Sentry orgs, you hit a wall. `mcpwarden` replaces that single connector with **N namespaced MCP servers — one per account/token** — and gives you one place to govern them.

It manages the **registry** (which account → which server → which scope), **generates** the MCP config for your clients, **resolves secrets at runtime** from your vault (never on disk, never in git), and tracks **read-only / scope policy** per server.

## Why local-first

A manager of *local* MCP servers must run *locally*: the configs live in `~/.claude.json`, the servers run on your machine over stdio, the secrets are yours. There is no cloud that can do this for you. `mcpwarden` is a CLI/TUI you run next to your tools.

## Secret-safe by design

- The registry holds **references** (`vaultwarden://item`), never secret values.
- Secrets are resolved by `mcpwarden run` at spawn time. `apply` may only preflight-check
  reachability; it never writes secret values or references to the client config.
- `.gitignore` blocks anything credential-shaped; `mcpwarden doctor` fails the build if a secret leaks into the registry.

## Quickstart

```bash
npm install
npm run build
npm link

mcpwarden init
mcpwarden doctor --privacy
mcpwarden profile use personal --apply
mcpwarden audit
```

Add a real account in one command:

```bash
mcpwarden add supabase acme-prod \
  --secret vaultwarden://supabase/acme-prod \
  --profile acme \
  --apply
```

GitHub is supported through the official Docker-based GitHub MCP Server:

```bash
mcpwarden add github acme-gh \
  --secret vaultwarden://github/acme-pat \
  --profile acme \
  --apply
```

`mcpwarden audit` shows exactly what the active context exposes to MCP clients. `mcpwarden
doctor --fix` only performs conservative local fixes, currently registry file permissions.

## What it is — and is not

mcpwarden is **not** another generic "MCP manager" — that category is crowded. It is a
**local identity boundary for MCP**: namespaced multi-account servers, secrets held by
*reference* in your vault, surgical reconciliation of `~/.claude.json`, and **exclusive
profiles** so Claude Code only ever sees the servers of the *active* context — never the whole
fleet at once. Full positioning, competitive landscape, and non-goals in
[`docs/VISION.md`](docs/VISION.md).

## Status

🚧 **Building in public.** Working local POC (registry + web console + surgical apply).

### v0.1 public gate

- [x] Registry model + provider-adapter contract
- [x] `list` + local web console — see every account/server/policy
- [x] Surgical `apply` to `~/.claude.json` (timestamped backup, preserves other keys)
- [x] **1 — Vaultwarden resolver, end-to-end** via a `run` launcher: generated entries are
  `mcpwarden run <server>` with an **empty env** — secret resolved at spawn, **never** written
  to `~/.claude.json`/logs/disk. Vault CLI configurable (`bw` default, `MCPWARDEN_VAULT_BIN`).
- [x] **2 — Exclusive profiles**: `mcpwarden profile use <ctx>` + a context switcher in the
  console. `apply` exposes only the active context's servers and **removes** the others —
  Claude Code never sees the whole fleet. Includes `apply --dry-run` and `rollback`.
- [x] **3 — `< 60s` onboarding**: one command — `mcpwarden add supabase acme --secret
  vaultwarden://… --profile acme --apply` — registers, validates the secret + provider live,
  reconciles `~/.claude.json`, and leaves a `rollback`. Sub-second in practice.
- [x] `doctor --privacy` — stricter pre-publication checks for tracked local files,
  private registry permissions, secret-shaped strings, and generated config leaks
- [x] `audit` — show the active context, exposed servers, risk domains, redacted secret refs,
  and warnings before applying to Claude Code
- [x] `init` — create a private local registry without copying YAML by hand
- [x] anonymized `accounts.example.yaml` + release docs before public launch
- [x] `release-check` — local gate for typecheck, tests, build, fresh init, privacy doctor,
  launcher-only generated config, and npm metadata
- [x] local package smoke test (`npm pack` + installed binary + fresh registry)

Run the release gate:

```bash
npm run release:check
```

Release notes and manual smoke tests live in [`docs/RELEASE.md`](docs/RELEASE.md).

### Post-v0.1

- [ ] Ink TUI dashboard
- [ ] More providers beyond Supabase/GitHub (Vercel, Sentry, Notion…)
- [ ] Exportable audit report
- [ ] Team/SaaS control plane design

## Providers

| Provider | Config gen | Live resources | Health |
|----------|:----------:|:--------------:|:------:|
| Supabase | ✅ | ⏳ | ✅ |
| GitHub   | ✅ | ⏳ | ✅ |
| Vercel   | ⏳ | ⏳ | ⏳ |
| Sentry   | ⏳ | ⏳ | ⏳ |

## License

MIT © Idriss Bhugeloo
