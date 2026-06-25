import test from "node:test";
import assert from "node:assert/strict";
import { githubAdapter } from "../src/providers/github.js";
import type { Account, McpServer } from "../src/core/types.js";

const account: Account = {
  id: "work",
  provider: "github",
  label: "work",
  auth: "pat",
  secretRef: "vaultwarden://github-work",
  riskDomain: "client",
  rotationDue: null,
};

const server: McpServer = {
  name: "github-work",
  account: "work",
  transport: "stdio",
  command: "docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server",
  policy: { readOnly: true, projectScope: "account", writeRequiresConfirm: true },
  resources: [],
  profiles: ["client"],
};

test("GitHub provider launches official Docker server with redacted runtime env", () => {
  const cfg = githubAdapter.buildServerConfig(account, server);

  assert.equal(cfg.command, "docker");
  assert.deepEqual(cfg.env, {
    GITHUB_PERSONAL_ACCESS_TOKEN: "vaultwarden://github-work",
    GITHUB_READ_ONLY: "1",
  });
  assert.deepEqual(cfg.args, [
    "run",
    "-i",
    "--rm",
    "-e",
    "GITHUB_PERSONAL_ACCESS_TOKEN",
    "-e",
    "GITHUB_READ_ONLY",
    "ghcr.io/github/github-mcp-server",
  ]);
});
