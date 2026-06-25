import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCommand } from "../src/commands/init.js";
import { loadRegistry } from "../src/core/registry.js";

function silence(fn: () => void): void {
  const log = console.log;
  console.log = () => undefined;
  try {
    fn();
  } finally {
    console.log = log;
  }
}

test("init creates a loadable private registry without overwriting by default", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcpwarden-init-"));
  const accountsPath = join(dir, "accounts.yaml");

  silence(() => initCommand({ registry: dir }));
  const first = readFileSync(accountsPath, "utf8");
  writeFileSync(accountsPath, first.replace("personal account", "kept account"), "utf8");

  silence(() => initCommand({ registry: dir }));
  assert.match(readFileSync(accountsPath, "utf8"), /kept account/);

  const reg = loadRegistry(dir);
  assert.equal(reg.accounts.length, 1);
  assert.equal(reg.servers.length, 1);

  if (process.platform !== "win32") {
    assert.equal(statSync(accountsPath).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, "servers.yaml")).mode & 0o777, 0o600);
  }
});

test("init --force overwrites registry templates", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcpwarden-init-force-"));
  silence(() => initCommand({ registry: dir }));
  writeFileSync(join(dir, "servers.yaml"), "servers: []\n", "utf8");

  silence(() => initCommand({ registry: dir, force: true }));
  assert.match(readFileSync(join(dir, "servers.yaml"), "utf8"), /supabase-personal/);
});
