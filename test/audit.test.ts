import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry, saveActiveProfile } from "../src/core/registry.js";
import { buildAuditReport, redactSecretRef } from "../src/core/audit.js";

function registryDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mcpwarden-audit-"));
  writeFileSync(
    join(dir, "accounts.yaml"),
    `accounts:
  - id: personal
    provider: supabase
    label: Personal
    auth: pat
    secret_ref: vaultwarden://personal-token
    risk_domain: personal
  - id: client
    provider: supabase
    label: Client
    auth: pat
    secret_ref: vaultwarden://client-token
    risk_domain: client
`,
    "utf8",
  );
  writeFileSync(
    join(dir, "servers.yaml"),
    `servers:
  - name: supabase-personal
    account: personal
    command: npx -y @supabase/mcp-server-supabase --read-only
    profiles: [personal]
    policy:
      read_only: true
      project_scope: account
      write_requires_confirm: true
    projects: []
  - name: supabase-client
    account: client
    command: npx -y @supabase/mcp-server-supabase
    profiles: [client]
    policy:
      read_only: false
      project_scope: account
      write_requires_confirm: true
    projects:
      - ref: abc
        name: client-db
        client_data: true
`,
    "utf8",
  );
  return dir;
}

test("audit warns when all context exposes client and non-client accounts", () => {
  const dir = registryDir();
  const report = buildAuditReport(loadRegistry(dir));

  assert.equal(report.activeProfile, null);
  assert.deepEqual(report.hidden, []);
  assert.equal(report.exposed.length, 2);
  assert.match(report.warnings.join("\n"), /context all exposes client and non-client/);
  assert.match(report.warnings.join("\n"), /WRITE enabled on a client account/);
  assert.equal(report.exposed.some((e) => e.secretRef.includes("client-token")), false);
});

test("audit respects active profiles and hides out-of-context servers", () => {
  const dir = registryDir();
  saveActiveProfile(dir, "client");
  const report = buildAuditReport(loadRegistry(dir));

  assert.equal(report.activeProfile, "client");
  assert.deepEqual(report.exposed.map((e) => e.server), ["supabase-client"]);
  assert.deepEqual(report.hidden, ["supabase-personal"]);
  assert.equal(report.warnings.some((w) => w.includes("context all")), false);
});

test("redactSecretRef keeps only the backend scheme", () => {
  assert.equal(redactSecretRef("vaultwarden://client/acme-prod#password"), "vaultwarden://[redacted]");
  assert.equal(redactSecretRef("env://TOKEN"), "env://[redacted]");
  assert.equal(redactSecretRef("not-a-ref"), "[redacted]");
});
