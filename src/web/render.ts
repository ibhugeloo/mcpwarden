/** Render the local web console from the registry (mirrors the CLI `list`). */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { LoadedRegistry } from "../core/registry.js";
import type { Account, McpServer } from "../core/types.js";
import { serversInProfile } from "../core/profiles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load the dashboard template lazily and from whichever layout we're running in:
 *  - dev (tsx):   src/web/template.html  → next to this module
 *  - bundled:     dist/web/template.html → under web/ next to the bundle
 * Lazy so non-web commands (run, apply…) never touch it.
 */
let _template: string | null = null;
function template(): string {
  if (_template !== null) return _template;
  const candidates = [join(__dirname, "template.html"), join(__dirname, "web", "template.html")];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`dashboard template not found (looked in: ${candidates.join(", ")})`);
  _template = readFileSync(found, "utf8");
  return _template;
}

/** Where "Ouvrir Vaultwarden" points. Configurable; defaults to the homelab vault. */
const VAULT_URL = process.env.MCPWARDEN_VAULT_URL || "https://vault.lab";

const e = (x: unknown): string =>
  String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Inline UI icons — consistent stroke, currentColor, no library. */
const ICON = {
  plus: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>`,
  key: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="10" r="3"/><path d="M8.1 7.9 13 3M11 5l1.5 1.5M9.6 6.4 11 7.8"/></svg>`,
  pencil: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.4 2.6l2 2L6 12l-2.6.6.6-2.6 7.4-7.4z"/><path d="M10.4 3.6l2 2"/></svg>`,
  unlink: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5 9.5 6.5"/><path d="M7 4.6 8 3.6a2.4 2.4 0 0 1 3.4 3.4l-1 1"/><path d="M9 11.4 8 12.4a2.4 2.4 0 0 1-3.4-3.4l1-1"/><path d="M2.6 2.6l10.8 10.8" opacity=".45"/></svg>`,
  chevron: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`,
  vault: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="8" cy="8" r="2.1"/><path d="M8 8h3.4"/></svg>`,
  external: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7A1.5 1.5 0 0 0 12.5 12V9.5"/><path d="M9 3.5h4v4M13 3.5 7.5 9"/></svg>`,
  eye: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8S3.8 3.5 8 3.5 14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>`,
  upload: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10.5V3M5 6l3-3 3 3"/><path d="M3 11v1.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V11"/></svg>`,
  close: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  arrow: () =>
    `<svg viewBox="0 0 26 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 7h22M18 2l5 5-5 5"/></svg>`,
  terminal: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6"/><path d="M4.6 6.6 6.6 8 4.6 9.4"/><path d="M8.4 9.6H11"/></svg>`,
  shield: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8 13 3.6v3.3c0 3.4-2.1 5.8-5 6.9-2.9-1.1-5-3.5-5-6.9V3.6L8 1.8z"/><path d="M5.8 8 7.4 9.6 10.4 6.4"/></svg>`,
  info: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v4.1"/><path d="M8 4.7h.01"/></svg>`,
  copy: () =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="8" height="8" rx="1.4"/><path d="M3 10.8H2.8A1.8 1.8 0 0 1 1 9V2.8A1.8 1.8 0 0 1 2.8 1H9a1.8 1.8 0 0 1 1.8 1.8V3"/></svg>`,
};

const BRAND_MARK = () =>
  `<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="3.5" width="19" height="21" rx="4" stroke-width="1.4"/><path d="M14 7.2 19 9v3.4c0 3.2-1.9 5.5-5 6.6-3.1-1.1-5-3.4-5-6.6V9l5-1.8z" stroke-width="1.4"/><path d="M11.5 13.2h5M14 10.7v5" stroke-width="1.3"/></svg>`;

/** Brand logos — real colours, not currentColor. */
const LOGO = {
  supabase: () =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3ECF8E" d="M11.9 23.2c-.5.6-1.5.3-1.5-.5l-.1-8.8h6c1 0 1.6 1.2.9 2l-5.3 7.3z"/><path fill="#3ECF8E" opacity=".55" d="M12.1.8c.5-.6 1.5-.3 1.5.5l.1 8.8h-6c-1 0-1.6-1.2-.9-2L12.1.8z"/></svg>`,
  github: () =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F1115" d="M12 2.1a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.9.6-3.5-1.2-3.5-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3 .8.1-.7.4-1.1.7-1.4-2.3-.3-4.7-1.1-4.7-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7.9.7 1.8v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2.1z"/></svg>`,
  vercel: () =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F1115" d="M12 4l9 16H3z"/></svg>`,
  sentry: () =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#6A5FC1" d="M12.7 5.3a.9.9 0 0 0-1.5 0L8.4 10c2.6 1.4 4.4 4 4.8 7.1h-2.1c-.4-2.3-1.7-4.2-3.6-5.4l-1.3 2.2c1.2.8 2.1 2 2.4 3.2H3.6c-.5 0-.8-.5-.6-1l4.8-8.3c.2-.4.8-.4 1 0l6.9 12c.2.4-.1.9-.5.9h-1.8c0 .7-.1 1.4-.2 2h2c1.7 0 2.8-1.9 1.9-3.4L12.7 5.3z"/></svg>`,
};

/** Displayed account name: the email address when present, else a cleaned label. */
const acctName = (a: Account) => a.email ?? a.label.replace(/\s*account$/i, "").trim();
const providerLogo = (provider: string): string =>
  (LOGO as Record<string, () => string>)[provider]?.() ?? ICON.shield();
const providerLabel = (provider: string): string =>
  provider.charAt(0).toUpperCase() + provider.slice(1);
const shellArg = (value: string): string =>
  /^[A-Za-z0-9._:/-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
const profileSwitchTargets = (profiles: string[]): string[] =>
  profiles.length ? profiles : ["all"];
const profileSwitchCommand = (profile: string): string =>
  `mcpwarden profile use ${shellArg(profile)} --apply`;
const profileSwitchLabel = (profile: string): string =>
  profile === "all" ? "Basculer tous" : `Basculer ${profile}`;

/** One service row: provider logo · name · account · symbol-only quick actions. */
function serviceRow(s: McpServer, accounts: Map<string, Account>): string {
  const acc = accounts.get(s.account)!;
  const provider = acc.provider;
  const projects = s.resources;
  const active = projects.filter((p) => p.status === "ACTIVE_HEALTHY").length;
  const isLive = active > 0;
  const ref = e(acc.secretRef);
  const email = e(acctName(acc));

  // Discrete governance markers — shown only in the expanded detail.
  const markers: string[] = [];
  if (s.policy.readOnly) markers.push("lecture seule");
  if (s.policy.projectScope === "account") markers.push("portée&nbsp;: compte");
  if (projects.some((p) => p.clientData)) markers.push("données client");

  const projRows = projects
    .map((p) => {
      const on = p.status === "ACTIVE_HEALTHY";
      const alias = p.meta?.alias ? ` <span class="palias">${e(p.meta.alias as string)}</span>` : "";
      const flag = p.clientData ? `<span class="pflag">données client</span>` : "";
      return `              <li class="prow">
                <span class="pdot ${on ? "on" : "off"}" aria-hidden="true"></span>
                <span class="pname">${e(p.name)}${alias}</span>
                ${flag}
                <span class="pmeta">${e(p.region ?? "—")}</span>
                <span class="pstate">${on ? "actif" : "inactif"}</span>
              </li>`;
    })
    .join("\n");

  const projCount = projects.length;
  const projLabel = `${projCount} projet${projCount > 1 ? "s" : ""}`;

  return `      <div class="service">
        <details class="svc">
          <summary class="svc-row">
            <span class="svc-status ${isLive ? "on" : "off"}" title="${isLive ? "Actif" : "Inactif"}" aria-hidden="true"></span>
            <span class="svc-logo" title="${e(providerLabel(provider))}" aria-hidden="true">${providerLogo(provider)}</span>
            <span class="svc-main">
              <span class="svc-name">${e(s.name)}</span>
              <span class="svc-sub">${email}</span>
            </span>
            <span class="svc-actions" data-stop>
              <button type="button" class="icon-btn" data-action="edit" data-service="${e(s.name)}" data-email="${email}" title="Modifier le compte" aria-label="Modifier le compte">${ICON.pencil()}</button>
              <button type="button" class="icon-btn" data-action="rotate" data-service="${e(s.name)}" title="Changer le secret" aria-label="Changer le secret">${ICON.key()}</button>
              <a class="icon-btn" href="${e(VAULT_URL)}" target="_blank" rel="noopener" title="Ouvrir dans Vaultwarden" aria-label="Ouvrir dans Vaultwarden">${ICON.external()}</a>
              <button type="button" class="icon-btn danger" data-action="disconnect" data-service="${e(s.name)}" title="Déconnecter" aria-label="Déconnecter">${ICON.unlink()}</button>
            </span>
            <span class="svc-toggle" aria-hidden="true">${ICON.chevron()}</span>
          </summary>
          <div class="svc-detail">
            <div class="svc-markers">
              ${markers.map((m) => `<span class="marker">${m}</span>`).join("")}
              <span class="marker muted">${projLabel}</span>
            </div>
            <div class="secret-line">
              <span class="sl-icon" aria-hidden="true">${ICON.vault()}</span>
              <span class="sl-label">Secret</span>
              <code class="sl-ref">${ref}</code>
              <a class="sl-link" href="${e(VAULT_URL)}" target="_blank" rel="noopener" title="Ouvrir dans Vaultwarden">${ICON.external()}<span>Vaultwarden</span></a>
            </div>
            <ul class="proj-list">
${projRows}
            </ul>
          </div>
        </details>
      </div>`;
}

/** Context switcher — the exclusive-profile selector. Active context highlighted. */
function profileSwitcher(active: string | null, profiles: string[], shown: number, hidden: number): string {
  const pill = (label: string, prof: string, on: boolean) =>
    `<button type="button" class="ctx-pill${on ? " is-active" : ""}" data-action="set-profile" data-profile="${e(prof)}">${e(label)}</button>`;
  let pills = pill("Tous", "all", active === null);
  for (const p of profiles) pills += pill(p, p, active === p);
  const switchRows = profileSwitchTargets(profiles)
    .map((profile) => {
      const command = profileSwitchCommand(profile);
      const note = profile === "all" ? "Expose tous les services" : "Applique ce contexte à Claude Code";
      return `        <div class="ctx-command">
          <span class="ctx-command-meta">
            <strong>${e(profileSwitchLabel(profile))}</strong>
            <span>${e(note)}</span>
          </span>
          <code class="ctx-command-code">${e(command)}</code>
          <button type="button" class="icon-btn cmd-copy" data-copy-command="${e(command)}" title="Copier la commande" aria-label="Copier la commande">${ICON.copy()}</button>
        </div>`;
    })
    .join("\n");
  const note =
    hidden > 0
      ? `${shown} exposé${shown > 1 ? "s" : ""} · ${hidden} masqué${hidden > 1 ? "s" : ""}`
      : `${shown} exposé${shown !== 1 ? "s" : ""}`;
  return `      <div class="ctx-bar">
        <span class="ctx-label">Contexte</span>
        <div class="ctx-pills">${pills}</div>
        <span class="ctx-note">${note}</span>
      </div>
      <div class="ctx-commands">
${switchRows}
      </div>`;
}

/** Topology widget — Claude Code → mcpwarden → one server per account (active context). */
function topologyWidget(servers: McpServer[], accounts: Map<string, Account>): string {
  const leaves = servers
    .map((s) => {
      const acc = accounts.get(s.account)!;
      const provider = acc.provider;
      const on = s.resources.some((p) => p.status === "ACTIVE_HEALTHY");
      const n = s.resources.length;
      return `        <div class="topo-leaf">
          <span class="tl-dot ${on ? "on" : "off"}" aria-hidden="true"></span>
          <span class="tl-logo" aria-hidden="true">${providerLogo(provider)}</span>
          <span class="tl-body">
            <span class="tl-name">${e(s.name)}</span>
            <span class="tl-meta">${e(acctName(acc))} · ${n} projet${n > 1 ? "s" : ""}</span>
          </span>
        </div>`;
    })
    .join("\n");

  const n = servers.length;
  return `    <section class="block topo">
      <div class="block-head">
        <h2>Topologie</h2>
        <span class="count">flux d'accès</span>
      </div>
      <div class="topo-flow">
        <div class="topo-node">
          <span class="tn-icon" aria-hidden="true">${ICON.terminal()}</span>
          <span class="tn-label">Claude Code</span>
          <span class="tn-meta">client MCP</span>
        </div>
        <span class="topo-arrow" aria-hidden="true">${ICON.arrow()}</span>
        <div class="topo-node hub">
          <span class="tn-icon" aria-hidden="true">${ICON.shield()}</span>
          <span class="tn-label">mcpwarden</span>
          <span class="tn-meta">${n} serveur${n > 1 ? "s" : ""} isolé${n > 1 ? "s" : ""}</span>
        </div>
        <span class="topo-arrow" aria-hidden="true">${ICON.arrow()}</span>
        <div class="topo-leaves">
${leaves || '          <div class="topo-leaf"><span class="tl-body"><span class="tl-meta">aucun serveur dans ce contexte</span></span></div>'}
        </div>
      </div>
    </section>`;
}

/** Compact CLI cheat sheet for users who prefer copying commands from the console. */
function commandCheatSheet(active: string | null, profiles: string[]): string {
  const profile = active ?? profiles[0] ?? "client";
  const profileArg = shellArg(profile);
  const switchRows = profileSwitchTargets(profiles).map((target) => ({
    label: profileSwitchLabel(target),
    note: target === "all" ? "Expose tout puis applique" : "Expose ce contexte puis applique",
    command: profileSwitchCommand(target),
  }));
  const rows = [
    {
      label: "Voir l'état",
      note: "Services, comptes, profils",
      command: "mcpwarden list",
    },
    {
      label: "Contrôler",
      note: "Registry, secrets, politique",
      command: "mcpwarden doctor --privacy",
    },
    ...switchRows,
    {
      label: "Ajouter",
      note: "Compte Supabase isolé",
      command: `mcpwarden add supabase perso --secret vaultwarden://supabase/pat --profile ${profileArg} --apply`,
    },
    {
      label: "Prévisualiser",
      note: "Sans écrire la config",
      command: "mcpwarden apply --dry-run",
    },
    {
      label: "Appliquer",
      note: "Écrit les lanceurs",
      command: "mcpwarden apply",
    },
    {
      label: "Auditer",
      note: "Rapport partageable",
      command: "mcpwarden audit --format markdown --output audit.md",
    },
    {
      label: "Revenir",
      note: "Sauvegarde précédente",
      command: "mcpwarden rollback --dry-run",
    },
  ];

  const body = rows
    .map(
      (r) => `        <div class="cmd-row">
          <span class="cmd-meta">
            <strong>${e(r.label)}</strong>
            <span>${e(r.note)}</span>
          </span>
          <code class="cmd-code">${e(r.command)}</code>
          <button type="button" class="icon-btn cmd-copy" data-copy-command="${e(r.command)}" title="Copier la commande" aria-label="Copier la commande">${ICON.copy()}</button>
        </div>`,
    )
    .join("\n");

  return `    <section class="block commands-block">
      <div class="block-head">
        <h2>Commandes</h2>
        <span class="count">antisèche CLI</span>
      </div>
      <div class="commands-panel">
${body}
      </div>
    </section>`;
}

/** Add-service panel — opened by the primary action. */
function addPanel(): string {
  return `  <div class="overlay" id="add-overlay" hidden>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div class="sheet-head">
        <h2 id="add-title">Ajouter un service</h2>
        <button type="button" class="icon-btn" data-action="close-add" aria-label="Fermer">${ICON.close()}</button>
      </div>
      <p class="sheet-lead">Un service expose un compte provider à Claude Code, en lecture seule par défaut.</p>
      <form class="form" onsubmit="return false">
        <div class="field">
          <span class="field-label">Provider</span>
          <div class="seg" role="group" aria-label="Provider">
            <button type="button" class="seg-opt is-active" data-action="select-provider" data-provider="supabase"><span class="seg-logo">${LOGO.supabase()}</span>Supabase</button>
            <button type="button" class="seg-opt" data-action="select-provider" data-provider="github"><span class="seg-logo">${LOGO.github()}</span>GitHub</button>
            <button type="button" class="seg-opt is-disabled" disabled><span class="seg-logo">${LOGO.vercel()}</span>Vercel<span class="soon">bientôt</span></button>
            <button type="button" class="seg-opt is-disabled" disabled><span class="seg-logo">${LOGO.sentry()}</span>Sentry<span class="soon">bientôt</span></button>
          </div>
        </div>
        <label class="field">
          <span class="field-label">Compte</span>
          <input class="input" id="add-account" type="text" placeholder="ex. vous@gmail.com" autocomplete="off" />
          <span class="field-hint">L'adresse e-mail ou l'identifiant du compte chez le provider.</span>
        </label>
        <label class="field">
          <span class="field-label">Référence du secret</span>
          <input class="input mono" id="add-secret" type="text" placeholder="vaultwarden://supabase-pat-…" autocomplete="off" />
          <span class="field-hint">Une référence Vaultwarden — jamais le secret en clair.</span>
        </label>
        <p class="form-error" id="add-error" hidden></p>
        <div class="sheet-foot">
          <button type="button" class="btn btn-ghost" data-action="close-add">Annuler</button>
          <button type="button" class="btn btn-primary" data-action="submit-add">Ajouter le service</button>
        </div>
      </form>
    </div>
  </div>`;
}

export interface DashboardContext {
  active: string | null;
  profiles: string[];
  sessionToken: string;
}

/** Empty state rendered when the registry has zero services configured. */
function emptyGlobalBlock(): string {
  // Plug icon: a power connector with a missing socket — communicates "nothing connected yet".
  const plugIcon = `<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="10" height="11" rx="2"/><path d="M10 3V1M16 3V1"/><path d="M13 14v5"/><circle cx="13" cy="22" r="2.2" stroke-dasharray="1.8 1.8"/></svg>`;

  return `    <section class="block">
      <div class="services">
        <div class="empty-global">
          <span class="eg-icon">${plugIcon}</span>
          <p class="eg-title">Aucun service configuré</p>
          <p class="eg-body">Ajoutez votre premier compte Supabase pour que mcpwarden puisse l'exposer à Claude Code.</p>
          <button type="button" class="btn btn-primary" data-action="open-add">${ICON.plus()} Ajouter un service</button>
        </div>
      </div>
    </section>`;
}

export function renderDashboard(reg: LoadedRegistry, ts: string, ctx: DashboardContext): string {
  const accounts = new Map(reg.accounts.map((a) => [a.id, a]));
  const acctCount = reg.accounts.length;
  const total = reg.servers.length;
  const shown = serversInProfile(reg.servers, ctx.active);
  const hidden = total - shown.length;

  const emptyServices = `      <div class="empty-state">Aucun service dans le contexte <strong>${e(ctx.active ?? "all")}</strong>.</div>`;

  const servicesBlock =
    total === 0
      ? emptyGlobalBlock()
      : `    <section class="block">
${profileSwitcher(ctx.active, ctx.profiles, shown.length, hidden)}
      <div class="block-head">
        <h2>Services</h2>
        <span class="count">${shown.length}/${total} service${total > 1 ? "s" : ""} · ${acctCount} compte${acctCount > 1 ? "s" : ""}</span>
      </div>
      <div class="services">
${shown.length ? shown.map((s) => serviceRow(s, accounts)).join("\n") : emptyServices}
      </div>
    </section>`;

  const repl: Record<string, string> = {
    __TS__: e(ts),
    __SERVICES_BLOCK__: servicesBlock,
    __TOPOLOGY__: topologyWidget(shown, accounts),
    __COMMANDS_BLOCK__: commandCheatSheet(ctx.active, ctx.profiles),
    __ADD_PANEL__: addPanel(),
    __SECRET_COUNT__: String(acctCount),
    __VAULT_URL__: e(VAULT_URL),
    __PLUS_ICON__: ICON.plus(),
    __UPLOAD_ICON__: ICON.upload(),
    __EYE_ICON__: ICON.eye(),
    __INFO_ICON__: ICON.info(),
    __BRAND_MARK__: BRAND_MARK(),
    __EXTERNAL_ICON__: ICON.external(),
    __VAULT_ICON__: ICON.vault(),
    __CLOSE_ICON__: ICON.close(),
    __SESSION_TOKEN__: e(ctx.sessionToken),
  };
  let out = template();
  for (const [k, v] of Object.entries(repl)) out = out.split(k).join(v);
  return out;
}
