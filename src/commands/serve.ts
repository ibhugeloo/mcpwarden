import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
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
 * Binds to localhost by default. Remote binds require explicit friction because
 * this surface mutates the local registry and can apply to ~/.claude.json.
 */
export function serveCommand(opts: {
  registry?: string;
  port: string;
  host: string;
  allowRemote?: boolean;
}): void {
  const port = Number(opts.port) || 4173;
  const host = opts.host || "127.0.0.1";
  const allowRemote = opts.allowRemote || process.env.MCPWARDEN_ALLOW_REMOTE === "1";

  if (!isLoopbackHost(host) && !allowRemote) {
    throw new Error(
      `Refusing to bind mcpwarden console to "${host}" without --allow-remote. ` +
        `The console can mutate your registry and apply ~/.claude.json.`,
    );
  }

  const sessionToken = randomBytes(24).toString("base64url");

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
    if (url.pathname === "/favicon.ico") return void res.writeHead(204).end();

    if (url.pathname.startsWith("/api/")) {
      if (!isAuthorized(req, url, sessionToken) || !validOrigin(req)) {
        return void sendJson(res, 403, { ok: false, error: "forbidden" });
      }
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      handleApi(req, res, opts.registry);
      return;
    }

    // GET /api/registry → YAML preview. Secret references are redacted because
    // vault item names can reveal client identities even though they are not values.
    if (req.method === "GET" && url.pathname === "/api/registry") {
      try {
        const reg = loadRegistry(opts.registry);
        const accounts = redactRegistryPreview(readFileSync(join(reg.dir, "accounts.yaml"), "utf8"));
        const servers = redactRegistryPreview(readFileSync(join(reg.dir, "servers.yaml"), "utf8"));
        sendJson(res, 200, { dir: reg.dir, accounts, servers });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: (err as Error).message });
      }
      return;
    }

    if (!isAuthorized(req, url, sessionToken)) {
      res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
      res.end(renderServeMessagePage({
        title: "Session token required",
        lead: "Use the private console URL printed by mcpwarden serve.",
        detail: "The local console is protected because it can mutate the registry and apply ~/.claude.json.",
        commands: ["mcpwarden serve"],
      }));
      return;
    }

    try {
      const reg = loadRegistry(opts.registry);
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
      const active = loadActiveProfile(reg.dir);
      const profiles = listProfiles(reg.servers);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderDashboard(reg, ts, { active, profiles, sessionToken }));
    } catch (err) {
      res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
      res.end(renderServeMessagePage({
        title: "Registry inaccessible",
        lead: "mcpwarden could not read the local registry for this console.",
        detail: (err as Error).message,
        commands: [
          "mcpwarden doctor --fix",
          "mcpwarden init",
          "mcpwarden serve --registry ~/.config/mcpwarden",
        ],
      }));
    }
  });

  server.listen(port, host, () => {
    const shown = host === "0.0.0.0" ? "<this-machine-ip>" : host;
    console.log(`\n  ${chalk.green("●")} mcpwarden console ${chalk.gray("(local-first)")}`);
    console.log(`  ${chalk.bold(`http://${shown}:${port}/?token=${sessionToken}`)}\n`);
    console.log(chalk.gray("  Ctrl-C to stop.\n"));
  });
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

function tokenFromRequest(req: IncomingMessage, url: URL): string | null {
  const header = req.headers["x-mcpwarden-token"];
  if (Array.isArray(header)) return header[0] ?? null;
  return header ?? url.searchParams.get("token");
}

function isAuthorized(req: IncomingMessage, url: URL, sessionToken: string): boolean {
  return tokenFromRequest(req, url) === sessionToken;
}

function validOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && (parsed.protocol === "http:" || parsed.protocol === "https:");
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function redactRegistryPreview(raw: string): string {
  return raw
    .replace(/^(\s*secret_ref:\s*).+$/gm, "$1[redacted reference]")
    .replace(/\b(?:vaultwarden|env):\/\/[^\s"',)]+/g, "[redacted reference]");
}

function renderServeMessagePage(input: {
  title: string;
  lead: string;
  detail: string;
  commands: string[];
}): string {
  const commands = input.commands
    .map((cmd) => `<code>${html(cmd)}</code>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>mcpwarden — ${html(input.title)}</title>
<style>
  :root {
    color-scheme: light;
    --bg:#F7F6F3;--surface:#FFFFFF;--surface-2:#FBFBFA;--surface-3:#F1EFEB;
    --ink:#2F3437;--ink-2:#5C615F;--ink-3:#8A8E8B;--line:#E7E5E0;
    --accent:#346538;--accent-soft:#EDF3EC;--danger:#9F2F2D;
    --radius:10px;--radius-sm:6px;
    --sans:"SF Pro Display","Helvetica Neue","Segoe UI",system-ui,sans-serif;
    --serif:"Newsreader",Georgia,"Times New Roman",serif;
    --mono:"SF Mono","JetBrains Mono",ui-monospace,Menlo,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--sans);
    font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;display:grid;place-items:center;padding:28px}
  .panel{width:min(640px,100%);background:var(--surface);border:1px solid var(--line);
    border-radius:var(--radius);padding:30px 32px}
  h1{font-family:var(--serif);font-size:26px;font-weight:500;letter-spacing:-.01em;line-height:1.15;margin-bottom:8px}
  .lead{color:var(--ink-2);margin-bottom:20px}
  .detail{border:1px solid var(--line);background:var(--surface-2);border-radius:var(--radius-sm);
    padding:12px 14px;color:var(--ink-2);font-family:var(--mono);font-size:12.5px;overflow:auto;white-space:pre-wrap}
  .next{margin-top:20px;color:var(--ink);font-weight:600;font-size:13px}
  .cmds{display:flex;flex-direction:column;gap:8px;margin-top:10px}
  code{display:block;border:1px solid var(--line);background:var(--surface-3);border-radius:var(--radius-sm);
    padding:8px 10px;font-family:var(--mono);font-size:12.5px;color:var(--ink)}
  .foot{margin-top:20px;color:var(--ink-3);font-size:12.5px}
</style>
</head>
<body>
  <main class="panel">
    <h1>${html(input.title)}</h1>
    <p class="lead">${html(input.lead)}</p>
    <pre class="detail">${html(input.detail)}</pre>
    <p class="next">Recovery commands</p>
    <div class="cmds">${commands}</div>
    <p class="foot">After fixing the registry, reload the private console URL printed in the terminal.</p>
  </main>
</body>
</html>`;
}

function html(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
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
    sendJson(res, code, body);
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
