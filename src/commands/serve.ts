import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { loadRegistry, loadActiveProfile, saveActiveProfile } from "../core/registry.js";
import { listProfiles } from "../core/profiles.js";
import { addService, changeSecret, disconnectService, editService, ActionError } from "../core/actions.js";
import { applyToClaude } from "../config/apply.js";
import { renderDashboard } from "../web/render.js";

/**
 * Local management console. GET re-renders from the registry on every request;
 * POST /api/* mutates the **mcpwarden registry** (never the live ~/.claude.json).
 * Binds to localhost by default; `--host 0.0.0.0` opts into LAN/Tailscale access.
 */
export function serveCommand(opts: { registry?: string; port: string; host: string }): void {
  const port = Number(opts.port) || 4173;
  const host = opts.host || "127.0.0.1";

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/favicon.ico") return void res.writeHead(204).end();

    if (req.method === "POST" && url.startsWith("/api/")) {
      handleApi(req, res, opts.registry);
      return;
    }

    // GET /api/registry → raw YAML of both files (read-only preview, zero secrets)
    if (req.method === "GET" && url === "/api/registry") {
      try {
        const reg = loadRegistry(opts.registry);
        const accounts = readFileSync(join(reg.dir, "accounts.yaml"), "utf8");
        const servers = readFileSync(join(reg.dir, "servers.yaml"), "utf8");
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ dir: reg.dir, accounts, servers }));
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
      }
      return;
    }

    try {
      const reg = loadRegistry(opts.registry);
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
      const active = loadActiveProfile(reg.dir);
      const profiles = listProfiles(reg.servers);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderDashboard(reg, ts, { active, profiles }));
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`registry error:\n${(err as Error).message}`);
    }
  });

  server.listen(port, host, () => {
    const shown = host === "0.0.0.0" ? "<this-machine-ip>" : host;
    console.log(`\n  ${chalk.green("●")} mcpwarden console ${chalk.gray("(local-first)")}`);
    console.log(`  ${chalk.bold(`http://${shown}:${port}`)}\n`);
    console.log(chalk.gray("  Ctrl-C to stop.\n"));
  });
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req: IncomingMessage, res: ServerResponse, dir?: string): Promise<void> {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
  try {
    const url = req.url ?? "";
    const body = await readBody(req);

    // POST /api/apply  → reconcile the registry into ~/.claude.json (surgical)
    if (url === "/api/apply") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const result = await applyToClaude(loadRegistry(dir), stamp);
      return send(200, { ok: true, ...result });
    }

    // POST /api/profile  → switch the active context
    if (url === "/api/profile") {
      const reg = loadRegistry(dir);
      const name = String(body.name ?? "").trim();
      saveActiveProfile(reg.dir, name && name !== "all" ? name : null);
      return send(200, { ok: true });
    }

    // POST /api/services  → add
    if (url === "/api/services") {
      const out = addService(dir, {
        provider: String(body.provider ?? "supabase"),
        account: String(body.account ?? ""),
        secretRef: String(body.secretRef ?? ""),
      });
      return send(200, { ok: true, ...out });
    }

    // POST /api/services/<name>/secret      → change secret
    // POST /api/services/<name>/edit        → edit account identity (email)
    // POST /api/services/<name>/disconnect  → remove
    const m = /^\/api\/services\/([^/]+)\/(secret|edit|disconnect)$/.exec(url);
    if (m) {
      const name = decodeURIComponent(m[1]!);
      if (m[2] === "secret") {
        changeSecret(dir, name, String(body.secretRef ?? ""));
      } else if (m[2] === "edit") {
        editService(dir, name, { email: String(body.email ?? "") });
      } else {
        disconnectService(dir, name);
      }
      return send(200, { ok: true });
    }

    send(404, { ok: false, error: "unknown endpoint" });
  } catch (err) {
    const status = err instanceof ActionError ? 400 : 500;
    send(status, { ok: false, error: (err as Error).message });
  }
}
