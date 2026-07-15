import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { Dashboard } from "../src/commands/tui.js";
import { loadRegistry, loadActiveProfile, saveActiveProfile } from "../src/core/registry.js";

const ARROW_RIGHT = "[C";
const ENTER = "\r";

function fixtureRegistry(): string {
  const dir = mkdtempSync(join(tmpdir(), "mcpwarden-tui-test-"));
  writeFileSync(
    join(dir, "accounts.yaml"),
    `accounts:
  - id: personal
    provider: supabase
    label: Personal
    auth: pat
    secret_ref: env://MCPWARDEN_TEST_PERSONAL
    risk_domain: personal
    rotation_due: null
  - id: acme
    provider: sentry
    label: Acme
    auth: pat
    secret_ref: env://MCPWARDEN_TEST_ACME
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
  - name: sentry-acme
    account: acme
    transport: stdio
    command: npx -y @sentry/mcp-server
    profiles:
      - acme
    policy:
      read_only: true
      project_scope: account
      write_requires_confirm: true
`,
    "utf8",
  );
  return dir;
}

const wait = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

test("TUI dashboard renders exposure for the active context with redacted refs", async () => {
  const dir = fixtureRegistry();
  saveActiveProfile(dir, "acme");
  const reg = loadRegistry(dir);

  const app = render(<Dashboard reg={reg} />);
  await wait();
  const frame = app.lastFrame()!;

  assert.match(frame, /mcpwarden/);
  assert.match(frame, /1 exposed · 1 hidden/);
  assert.match(frame, /● sentry-acme/);
  assert.match(frame, /○ supabase-personal/);
  assert.match(frame, /env:\/\/\[redacted\]/);
  assert.doesNotMatch(frame, /MCPWARDEN_TEST_ACME/);
  app.unmount();
});

test("TUI arrows preview a context and Enter saves the active profile", async () => {
  const dir = fixtureRegistry();
  saveActiveProfile(dir, "acme");
  const reg = loadRegistry(dir);

  const app = render(<Dashboard reg={reg} />);
  await wait();

  // options are [all, acme, personal]; cursor starts on acme → move to personal
  app.stdin.write(ARROW_RIGHT);
  await wait();
  assert.match(app.lastFrame()!, /preview — Enter to set/);
  assert.match(app.lastFrame()!, /● supabase-personal/);
  assert.equal(loadActiveProfile(dir), "acme"); // preview writes nothing

  app.stdin.write(ENTER);
  await wait();
  assert.match(app.lastFrame()!, /context saved/);
  assert.equal(loadActiveProfile(dir), "personal");
  app.unmount();
});
