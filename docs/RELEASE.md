# Release checklist

This project is local-first and secret-sensitive. A release is acceptable only if
the local workflow stays private by default and generated client config remains
launcher-only.

## Local gate

```bash
npm run release:check
```

The gate runs typecheck, tests, build, a fresh `mcpwarden init`, `doctor --privacy`,
generated-config leak checks, audit redaction checks, and package metadata checks.

## Fresh install smoke test

```bash
npm ci
npm run build
npm link

tmp="$(mktemp -d)"
mcpwarden --registry "$tmp" init
mcpwarden --registry "$tmp" doctor --privacy
mcpwarden --registry "$tmp" add github acme-gh \
  --secret env://MCPWARDEN_TEST_GITHUB \
  --profile acme
mcpwarden --registry "$tmp" profile use acme
mcpwarden --registry "$tmp" audit
```

Expected result: no secret values or full secret refs appear in generated client
config or audit output. `add` may warn that the test env var is missing; that is
acceptable for the smoke test.

## Manual checks

- Confirm `registry/accounts.yaml`, `registry/servers.yaml`, and `registry/state.yaml`
  are not tracked.
- Confirm the README still positions mcpwarden as a local identity boundary, not a
  generic MCP manager.
- Confirm `mcpwarden serve --host 0.0.0.0` refuses to start unless `--allow-remote`
  is explicitly passed.
