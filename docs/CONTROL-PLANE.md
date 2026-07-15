# Team control plane — design (no implementation)

> Status: **design only** (roadmap item "Team/SaaS control plane design"). Nothing here is
> committed work. [`VISION.md`](VISION.md) takes precedence: local-first with **no cloud
> dependency to use the tool** is a hard invariant, and a non-goal explicitly says "no cloud,
> no SaaS". This document exists to resolve that tension deliberately instead of drifting
> into it: the team layer must be **git-first**, and anything hosted must be strictly
> optional, additive, and secret-free.

## Problem

A small agency (2–10 devs) juggles the same client boundaries mcpwarden solves for one
person: which MCP servers exist per client, which accounts they map to, what policy applies
(read-only, scopes, profiles). Today each member hand-maintains their own registry; the
boundaries silently diverge — one dev's "acme" context exposes a server another dev's
doesn't, policies drift, nobody can audit the team's exposure in one place.

## What the registry already gives us

The registry is **YAML with zero secrets by construction** (`SecretRef` rejects credential
shapes; `doctor --privacy` scans for leaks). That makes it safe to version and share as-is.
The design consequence: **the control plane is a shared registry, and the natural transport
for a shared registry is git** — not a server.

## Design

### Layer 0 — conventions only (works today, zero code)

- A team keeps a private git repo holding `accounts.yaml` + `servers.yaml`
  (`state.yaml` stays local per member — the active context is personal by design).
- Each member points `MCPWARDEN_REGISTRY` (or `--registry`) at their clone.
- Secret refs are shared **as references** (`vaultwarden://clients/acme-supabase`); each
  member's own vault access decides what they can actually resolve. Someone without the
  vault item gets a clean "secret not resolvable" failure — access control stays in the
  vault, where it belongs.
- `doctor` + CI on the registry repo replay the same gates as this repo (privacy scan,
  schema validation, policy sanity).

### Layer 1 — first-class team verbs (CLI work, still no server)

- `mcpwarden team pull / push / diff` — thin wrappers around git for the registry dir, with
  a schema-aware diff ("server X gained WRITE", "profile acme now exposes N servers") instead
  of raw YAML hunks.
- **Policy floor**: a `team.yaml` (optional, versioned with the registry) can declare
  minimums — e.g. `client-*` servers must be read-only, every server must carry a profile
  tag. `doctor` fails locally when the local registry is weaker than the floor. Members can
  be stricter, never looser.
- **Audit exchange**: `mcpwarden audit --format json` per member, committed or sent
  out-of-band; `mcpwarden team audit` merges those reports into one exposure table (who can
  reach which client, with what policy). Still no server: files in, table out.

### Layer 2 — hosted control plane (optional, revenue, explicitly gated)

Only worth building on demonstrated Layer-1 pull. A small hosted service that stores
**registries and audit reports — never secrets, never tokens, not even secret refs if the
team marks them private**:

- team dashboard: exposure by client/member, drift vs the policy floor, rotation-due nags;
- registry distribution for teams that don't want to run a git remote;
- webhooks ("a WRITE server appeared in a client profile").

Hard rules carried over from the invariants: the CLI must keep working fully without the
service (local-first invariant #5 — the service is a mirror, not a dependency); the service
never stores a secret value (invariant #1 extends to the wire: audit payloads are already
redacted by construction); apply/run stay 100% local.

## Non-goals (inherited and extended)

- No runtime gateway/proxy — we reconcile config, we do not route MCP traffic.
- No secret sync, no team vault — Vaultwarden/Bitwarden already do that; we integrate.
- No per-seat license enforcement inside the CLI (MIT stays MIT; the hosted layer is the
  product, not a crippled CLI).

## Open questions (to settle before any Layer-1 code)

1. Merge semantics when two members edit `servers.yaml` concurrently — git conflict is
   acceptable v1, but the schema-aware diff should at least explain it.
2. Should the policy floor live in the same repo as the registry (simple) or be signable by
   a team owner (tamper-evident)? Leaning simple first.
3. Audit-report privacy: account labels can reveal client names; `team audit` likely needs
   the same redaction pass as the exportable audit report.

## Verdict

Layer 0 is documentation away from real. Layer 1 is a modest CLI increment that stays
inside every existing invariant. Layer 2 is the only place "SaaS" appears, and it is
deliberately last, optional, and secret-free — if it ever conflicts with local-first, it
loses.
