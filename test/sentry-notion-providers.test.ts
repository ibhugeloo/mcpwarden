import test from "node:test";
import assert from "node:assert/strict";
import { sentryAdapter } from "../src/providers/sentry.js";
import { notionAdapter } from "../src/providers/notion.js";
import type { Account, McpServer } from "../src/core/types.js";

const policy = { readOnly: true, projectScope: "account", writeRequiresConfirm: true } as const;

const sentryAccount: Account = {
  id: "acme-sentry",
  provider: "sentry",
  label: "acme-sentry",
  auth: "pat",
  secretRef: "vaultwarden://sentry-acme",
  riskDomain: "client",
  rotationDue: null,
};

const sentryServer: McpServer = {
  name: "sentry-acme-sentry",
  account: "acme-sentry",
  transport: "stdio",
  command: "npx -y @sentry/mcp-server",
  policy: { ...policy },
  resources: [],
  profiles: ["acme"],
};

test("Sentry provider launches official server with the secret as a reference only", () => {
  const cfg = sentryAdapter.buildServerConfig(sentryAccount, sentryServer);

  assert.equal(cfg.command, "npx");
  assert.deepEqual(cfg.args, ["-y", "@sentry/mcp-server"]);
  assert.deepEqual(cfg.env, { SENTRY_ACCESS_TOKEN: "vaultwarden://sentry-acme" });
});

const notionAccount: Account = {
  id: "acme-notion",
  provider: "notion",
  label: "acme-notion",
  auth: "pat",
  secretRef: "vaultwarden://notion-acme",
  riskDomain: "client",
  rotationDue: null,
};

const notionServer: McpServer = {
  name: "notion-acme-notion",
  account: "acme-notion",
  transport: "stdio",
  command: "npx -y @notionhq/notion-mcp-server",
  policy: { ...policy },
  resources: [],
  profiles: ["acme"],
};

test("Notion provider launches official server with the secret as a reference only", () => {
  const cfg = notionAdapter.buildServerConfig(notionAccount, notionServer);

  assert.equal(cfg.command, "npx");
  assert.deepEqual(cfg.args, ["-y", "@notionhq/notion-mcp-server"]);
  assert.deepEqual(cfg.env, { NOTION_TOKEN: "vaultwarden://notion-acme" });
});

test("Sentry and Notion default policies are read-only account scope", () => {
  for (const adapter of [sentryAdapter, notionAdapter]) {
    const p = adapter.defaultPolicy();
    assert.equal(p.readOnly, true);
    assert.equal(p.projectScope, "account");
    assert.equal(p.writeRequiresConfirm, true);
  }
});
