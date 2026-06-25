import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry, saveActiveProfile } from "../src/core/registry.js";
import { applyToClaude } from "../src/config/apply.js";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    prev.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function withEnvAsync<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    prev.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function fixtureRegistry(): string {
  const dir = mkdtempSync(join(tmpdir(), "mcpwarden-test-reg-"));
  writeFileSync(
    join(dir, "accounts.yaml"),
    `accounts:
  - id: personal
    provider: supabase
    label: Personal
    email: personal@example.test
    auth: pat
    secret_ref: env://MCPWARDEN_TEST_PERSONAL
    risk_domain: personal
    rotation_due: null
  - id: client
    provider: supabase
    label: Client
    email: client@example.test
    auth: pat
    secret_ref: env://MCPWARDEN_TEST_CLIENT
    risk_domain: client
    rotation_due: null
`,
    "utf8",
  );
  writeFileSync(
    join(dir, "servers.yaml"),
    `servers:
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
  - name: supabase-client
    account: client
    transport: stdio
    command: npx -y @supabase/mcp-server-supabase --read-only
    profiles:
      - client
    policy:
      read_only: true
      project_scope: account
      write_requires_confirm: true
    projects: []
`,
    "utf8",
  );
  return dir;
}

test("apply writes only launcher entries for the active context and preserves user entries", async () => {
  const dir = fixtureRegistry();
  const claudeJson = join(dir, "claude.json");
  writeFileSync(
    claudeJson,
    JSON.stringify(
      {
        theme: "keep-me",
        mcpServers: {
          custom: { type: "stdio", command: "node", args: ["custom.js"], env: { KEEP: "yes" } },
          "supabase-personal": { type: "stdio", command: "mcpwarden", args: ["run", "supabase-personal"], env: {} },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  await withEnvAsync(
    {
      MCPWARDEN_CLAUDE_JSON: claudeJson,
      MCPWARDEN_BIN: "/opt/mcpwarden/bin/mcpwarden",
      MCPWARDEN_TEST_CLIENT: undefined,
      MCPWARDEN_TEST_PERSONAL: undefined,
    },
    async () => {
      saveActiveProfile(dir, "client");
      const reg = loadRegistry(dir);
      const result = await applyToClaude(reg, "2026-06-26T00-00-00Z", { check: false });

      assert.deepEqual(result.added, ["supabase-client"]);
      assert.deepEqual(result.updated, []);
      assert.deepEqual(result.removed, ["supabase-personal"]);
      assert.equal(result.changed, true);
      assert.equal(existsSync(`${claudeJson}.mcpwarden-bak-2026-06-26T00-00-00Z`), true);

      const written = JSON.parse(readFileSync(claudeJson, "utf8"));
      assert.equal(written.theme, "keep-me");
      assert.deepEqual(written.mcpServers.custom, {
        type: "stdio",
        command: "node",
        args: ["custom.js"],
        env: { KEEP: "yes" },
      });
      assert.equal(written.mcpServers["supabase-personal"], undefined);
      assert.deepEqual(written.mcpServers["supabase-client"], {
        type: "stdio",
        command: "/opt/mcpwarden/bin/mcpwarden",
        args: ["run", "supabase-client"],
        env: {},
      });

      const serialized = JSON.stringify(written);
      assert.equal(serialized.includes("env://"), false);
      assert.equal(serialized.includes("MCPWARDEN_TEST_CLIENT"), false);
      assert.equal(serialized.includes("client-secret-value"), false);
    },
  );
});

test("apply dry-run computes the plan without writing config or backup files", async () => {
  const dir = fixtureRegistry();
  const claudeJson = join(dir, "claude.json");

  await withEnvAsync(
    { MCPWARDEN_CLAUDE_JSON: claudeJson, MCPWARDEN_BIN: "/opt/mcpwarden/bin/mcpwarden" },
    async () => {
      saveActiveProfile(dir, "personal");
      const reg = loadRegistry(dir);
      const result = await applyToClaude(reg, "dry-run-stamp", { check: false, dryRun: true });

      assert.deepEqual(result.added, ["supabase-personal"]);
      assert.equal(result.changed, true);
      assert.equal(result.backup, null);
      assert.equal(existsSync(claudeJson), false);
      assert.equal(existsSync(`${claudeJson}.mcpwarden-bak-dry-run-stamp`), false);
    },
  );
});

test("apply preflight validates only servers in the active profile", async () => {
  const dir = fixtureRegistry();
  const claudeJson = join(dir, "claude.json");

  await withEnvAsync(
    {
      MCPWARDEN_CLAUDE_JSON: claudeJson,
      MCPWARDEN_BIN: "/opt/mcpwarden/bin/mcpwarden",
      MCPWARDEN_TEST_CLIENT: "client-secret-value",
      MCPWARDEN_TEST_PERSONAL: undefined,
    },
    async () => {
      saveActiveProfile(dir, "client");
      const reg = loadRegistry(dir);
      const result = await applyToClaude(reg, "preflight-stamp", { check: true, dryRun: true });

      assert.deepEqual(result.validated, ["supabase-client"]);
      assert.deepEqual(result.unresolved, []);
    },
  );
});

test("SecretRef validation rejects likely literal tokens", () => {
  withEnv({}, () => {
    assert.throws(() => loadRegistryWithSecret("sbp_" + "literal_token"), /looks like a real secret/);
    assert.throws(() => loadRegistryWithSecret("ghp_" + "literal_token"), /looks like a real secret/);
    assert.doesNotThrow(() => loadRegistryWithSecret("vaultwarden://safe-item"));
  });
});

function loadRegistryWithSecret(secretRef: string): void {
  const dir = mkdtempSync(join(tmpdir(), "mcpwarden-test-secret-"));
  writeFileSync(
    join(dir, "accounts.yaml"),
    `accounts:
  - id: personal
    provider: supabase
    label: Personal
    auth: pat
    secret_ref: ${secretRef}
    risk_domain: personal
`,
    "utf8",
  );
  writeFileSync(join(dir, "servers.yaml"), "servers: []\n", "utf8");
  loadRegistry(dir);
}
