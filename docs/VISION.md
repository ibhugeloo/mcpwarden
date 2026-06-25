# mcpwarden — product direction

> Cadrage figé après revue concurrentielle + contradiction (2026-06-25).
> Source de la décision : croisement d'une recherche marché, du benchmark de l'UX MCP
> native de Claude Code, et d'un avis contradictoire externe. Ce fichier prime sur
> l'intuition : si une feature ne sert pas la thèse ci-dessous, elle attend.

## La thèse en une ligne

**mcpwarden n'est pas un "gestionnaire MCP". C'est une frontière d'identité MCP locale,
par client/projet — versionnée, auditable, read-only par défaut.**

Vendu comme wrapper de `claude mcp add`, l'outil est jetable (un dev avancé écrit quatre
entrées dans `~/.claude.json` à la main). Vendu comme *guardrail multi-identités*, il a un
wedge défendable.

## Le problème réel

Les clients MCP (Claude Code/Desktop, Cursor…) lient **un compte par connecteur** côté
OAuth managé (claude.ai). Dès qu'on a deux comptes Supabase (perso + client), plusieurs
orgs Sentry, un Vercel perso + un Vercel client, on heurte le mur. Le contournement natif
existe (déclarer des serveurs stdio nommés différemment dans `~/.claude.json`) mais il est
**manuel, en clair, et sans garde-fou** :

- les tokens finissent en clair dans `~/.claude.json` / `.mcp.json` ;
- rien n'empêche d'exposer le mauvais projet client à Claude ;
- le read-only se *documente*, il ne s'*impose* pas ;
- une réinstallation de Claude Code perd tout.

## Le wedge

> *« Je passe de mon compte Supabase perso à celui du client sans jamais exposer le mauvais
> projet à Claude — en read-only, sans copier le token dans un fichier. »*

Quatre piliers, et c'est leur **intersection** qui est libre sur le marché :

1. **Multi-comptes namespacés first-class** — deux comptes Supabase = deux serveurs propres,
   nommés et générés automatiquement. Le natif force le bricolage manuel.
2. **Profils / contextes exclusifs** — Claude Code ne voit que les serveurs du **contexte
   actif**, jamais toute la flotte en permanence. *(C'est la killer-feature, pas la console.)*
3. **Zéro-secret par référence Vaultwarden** — le registry ne contient que des `vaultwarden://`.
   Le secret n'atterrit **jamais** dans `~/.claude.json`, les logs, ou les args de process.
4. **Apply chirurgical local** — réconcilie `~/.claude.json` avec backup horodaté, préserve
   les autres clés, ne casse jamais une entrée, rollback disponible.

## Paysage concurrentiel (2026-06-25)

Le terrain "MCP manager / gateway" est **encombré mais pas saturé sur cette cible précise**.
Personne ne tient les quatre piliers ensemble.

| Outil | Angle | Multi-comptes namespacés | Local-first / secret-safe |
|---|---|---|---|
| **mcpm.sh** | Manager générique (profils, router) | Non | Local oui / secrets en clair |
| **MCP-Toggle** | Édite `~/.claude.json` (scripts bruts) | Non | Oui / pas de secrets |
| **ToolHive** (stacklok) | Isolation conteneur, entreprise | Non documenté | Partiel / secrets chiffrés |
| **mcp-secrets-vault / LocalVault** | Zéro-secret local (mono-serveur) | Non | Oui / coffre maison ≠ Vaultwarden |
| **pluggedin** | Namespace + workspaces | Partiel | **Non — cloud obligatoire** |
| **MetaMCP** | Gateway/agrégateur runtime | Non conçu pour | Self-host |

**Concurrent à battre : mcpm.sh.** Risque réel : qu'il ajoute un backend coffre. Notre
parade = planter vite le drapeau "Vaultwarden + namespace + profils exclusifs".

## Non-goals (ce qu'on ne fait PAS)

- Pas un énième "MCP manager" générique (catégorie bondée — se vendre ainsi = perdant).
- Pas un gateway/proxy runtime (modèle différent ; on réconcilie une config, on ne route pas
  le trafic).
- Pas de cloud, pas de SaaS, pas de dépendance API distante (différenciant net vs pluggedin).
- Pas de "montrer le token" dans l'UI — seulement "ouvrir le coffre".

## Décision d'architecture — les secrets ne touchent jamais `~/.claude.json`

Claude Code **expande nativement `${VAR}`** dans `~/.claude.json` / `.mcp.json`. On s'appuie
dessus au lieu de résoudre-puis-écrire-en-clair :

- `apply` écrit une **référence** `${MCPWARDEN_<svc>}` dans le `env` du serveur, jamais la valeur.
- un **launcher** (`mcpwarden run <svc>` ou un shim de commande) résout la référence
  `vaultwarden://` au spawn, peuple l'env du process serveur, et n'écrit la valeur nulle part.
- conséquence : `~/.claude.json` reste exempt de secret ; un dump du fichier ne fuite rien.

> ✅ Résolu (2026-06-25) : `apply` n'écrit plus aucun secret ni référence dans `~/.claude.json`.
> Chaque entrée générée est un appel launcher `mcpwarden run <serveur>` avec `env: {}`. La
> commande `mcpwarden run` résout `vaultwarden://…` au spawn (CLI vault configurable —
> `bw` par défaut, override `MCPWARDEN_VAULT_BIN`/`MCPWARDEN_VAULT_ARGS`) et injecte le secret
> dans l'env du serveur enfant uniquement. Prouvé end-to-end : un dump de `~/.claude.json` ne
> fuite rien. Reste : que les PAT soient effectivement stockés dans le coffre.

## Durcissement avant build-in-public

🔴 **Secrets** : jamais dans `~/.claude.json` / logs / crash / args ; redaction partout ;
fichiers sensibles en `0600` ; test CI "no secret leaked" sur registry + backups + logs +
config générée.

🔴 **Mélange perso/client** : profils exclusifs obligatoires ; tags `personal/client/staging/prod` ;
warning bloquant si plusieurs tenants sensibles actifs ; noms explicites
(`client-acme-supabase-prod-ro`) ; write access derrière friction volontaire.

🔴 **Registry public GitHub** : `accounts.example.yaml` anonymisé, jamais un vrai registry ;
`.gitignore` agressif (`accounts.yaml`, `servers.yaml`, backups Claude, logs) ;
`mcpwarden doctor --privacy` avant publication (les refs `vaultwarden://` peuvent trahir des
noms clients → anonymiser les exemples) ; hook/scan pre-commit anti-secret.

🟡 **Console web locale** : bind `127.0.0.1` only ; token de session local ; CSRF ; aucune
API ne retourne un secret ; console désactivable.

## Roadmap — Top 3 avant la sortie publique (ordre strict)

1. **Vaultwarden end-to-end + secret hors `~/.claude.json`.**
   Sortie : `vaultwarden://…` réellement résolu, le serveur Supabase démarre avec le secret
   résolu, aucun secret sur disque/logs/args, erreur propre si secret absent/expiré.
   *Sans ça, "warden" est du marketing.*

2. ✅ **Profils exclusifs + apply par contexte** (fait 2026-06-25). `mcpwarden profile use <ctx>`
   + sélecteur de contexte dans la console ; `apply` n'expose que les serveurs du contexte actif
   et **retire** les autres (exclusivité prouvée : changer de contexte échange les serveurs gérés,
   les entrées non-mcpwarden restées intactes) ; `apply --dry-run` + `rollback` présents.

3. ✅ **Onboarding < 60 s, une commande, validation live** (fait 2026-06-25).
   `mcpwarden add supabase acme-prod --secret vaultwarden://supabase/acme --profile acme --apply`
   (read-only par défaut ; `--no-readonly` pour l'écriture) enchaîne : ajout au registre →
   `✓ secret résolu` → `✓ provider joignable` (health API) → `apply` (config réconciliée) →
   `↩ rollback`. Mesuré **sous la seconde**. Secret pas encore stocké = signalé, non bloquant.

## Le risque existentiel — et la parade

Anthropic peut tuer le wedge "natif" en livrant : multi-comptes OAuth par provider, profils
MCP par workspace, permissions par projet, références de secrets. **Ne pas construire « Claude
ne sait pas encore gérer plusieurs Supabase »** (une rustine). Construire **« frontière locale
d'identité MCP par client/projet, versionnée, auditable, read-only par défaut »** — ça survit à
un Anthropic qui comble le manque natif, car les self-hosters Vaultwarden et les agences à
isolation client restent une niche qu'Anthropic ne servira pas.

## Public cible

Devs solo / petites agences qui jonglent perso + plusieurs clients, **self-hosters
Bitwarden/Vaultwarden** (segment sous-servi), exigeant du local-first sans cloud.
