# mcpwarden

> Local-first CLI/TUI to manage **multi-account MCP servers** across providers — secret-safe by design.

Most MCP clients (Claude, Cursor…) bind **one account per connector** via OAuth. The moment you have two Supabase accounts, a personal + a client Vercel, or several Sentry orgs, you hit a wall. `mcpwarden` replaces that single connector with **N namespaced MCP servers — one per account/token** — and gives you one place to govern them.

It manages the **registry** (which account → which server → which scope), **generates** the MCP config for your clients, **resolves secrets at runtime** from your vault (never on disk, never in git), and tracks **read-only / scope policy** per server.

## Why local-first

A manager of *local* MCP servers must run *locally*: the configs live in `~/.claude.json`, the servers run on your machine over stdio, the secrets are yours. There is no cloud that can do this for you. `mcpwarden` is a CLI/TUI you run next to your tools.

## Secret-safe by design

- The registry holds **references** (`vaultwarden://item`), never secret values.
- Secrets are resolved **at apply/run time** and never persisted or logged.
- `.gitignore` blocks anything credential-shaped; `mcpwarden doctor` fails the build if a secret leaks into the registry.

## What it is — and is not

mcpwarden is **not** another generic "MCP manager" — that category is crowded. It is a
**local identity boundary for MCP**: namespaced multi-account servers, secrets held by
*reference* in your vault, surgical reconciliation of `~/.claude.json`, and **exclusive
profiles** so Claude Code only ever sees the servers of the *active* context — never the whole
fleet at once. Full positioning, competitive landscape, and non-goals in
[`docs/VISION.md`](docs/VISION.md).

## Status

🚧 **Building in public.** Working local POC (registry + web console + surgical apply).
Roadmap — top 3 before public release, strict order:

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
- [ ] `doctor --privacy` — fail if a secret or client name could leak before publishing
- [ ] anonymized `accounts.example.yaml` + `npm link` install docs, then `git init` (public)
- [ ] Ink TUI dashboard
- [ ] Providers beyond Supabase (Vercel, Sentry, Notion, GitHub…)

## Providers

| Provider | Config gen | Live resources | Health |
|----------|:----------:|:--------------:|:------:|
| Supabase | ✅ | ⏳ | ⏳ |
| Vercel   | ⏳ | ⏳ | ⏳ |
| Sentry   | ⏳ | ⏳ | ⏳ |

## License

MIT © Idriss Bhugeloo
