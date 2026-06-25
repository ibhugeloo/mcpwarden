---
version: alpha
name: mcpwarden — Brand Identity Contract
description: >
  Contrat d'identité visuelle de mcpwarden (CLI/TUI local-first + vue web `serve`).
  Univers éditorial calme et clair : canvas bone chaud, encre charbon (jamais noir
  pur), UN seul accent — vert sobre — réservé à l'état actif/OK et aux liens. Titres
  en serif Newsreader, données/identifiants en mono. Le rouge est strictement le
  danger. Identité COHÉRENTE entre les deux surfaces : le CLI (chalk) et le web
  partagent la même sémantique (vert = OK/accent, rouge = danger, gris = meta).
  Tokens mappés 1:1 sur les variables :root de src/web/template.html — pas de vérité
  parallèle.

# Tokens — miroir exact de src/web/template.html :root
colors:
  # Surfaces (clair, warm-bone)
  bg: "#F7F6F3"          # --bg — canvas bone chaud
  surface: "#FFFFFF"     # --surface — cartes, panneaux
  surface-2: "#FBFBFA"   # --surface-2 — hover de ligne, inputs, surfaces enfoncées
  surface-3: "#F1EFEB"   # --surface-3 — fond de pilule/chip (markers, flags, soon)
  # Texte (charbon, jamais #000)
  ink: "#2F3437"         # --ink — texte par défaut
  ink-2: "#5C615F"       # --ink-2 — texte secondaire
  ink-3: "#8A8E8B"       # --ink-3 — meta atténué
  # Lignes / séparateurs
  line: "#E7E5E0"        # --line — bordures, dividers
  line-2: "#EFEDE9"      # --line-2 — divider interne plus léger
  # Accent UNIQUE — vert sobre
  accent: "#346538"      # --accent — état actif/OK, liens, focus
  accent-soft: "#EDF3EC" # --accent-soft — halo de statut, fonds actifs, sélection
  # Danger
  danger: "#9F2F2D"      # --danger — destructif, erreurs

typography:
  fonts:
    sans: "'SF Pro Display','Helvetica Neue','Segoe UI',system-ui,sans-serif"  # --sans
    serif: "'Newsreader',Georgia,'Times New Roman',serif"                       # --serif
    mono: "'SF Mono','JetBrains Mono',ui-monospace,Menlo,monospace"             # --mono
  base:                  # body
    fontFamily: "{typography.fonts.sans}"
    fontSize: 15px
    lineHeight: 1.6
  brand-title:           # .brand h1 — nom de marque
    fontFamily: "{typography.fonts.serif}"
    fontWeight: 500
    fontSize: 30px
    letterSpacing: -0.02em
    lineHeight: 1.1
  sheet-title:           # .sheet-head h2 — titres de panneau
    fontFamily: "{typography.fonts.serif}"
    fontWeight: 500
    fontSize: 21px
    letterSpacing: -0.01em
  section-label:         # .block-head h2 — label de section
    fontFamily: "{typography.fonts.sans}"
    fontSize: 13px
    fontWeight: 600
    letterSpacing: 0.02em
  data-mono:             # noms de services, identifiants, chemins, code
    fontFamily: "{typography.fonts.mono}"
    fontWeight: 550

rounded:                 # --radius / --radius-sm + pill
  sm: 6px                # boutons, inputs, chips, nœuds
  md: 10px               # cartes, panneaux, sheets
  pill: 9999px           # markers, flags, badges "soon"

shadow:
  sheet: "0 12px 40px rgba(47,52,55,.10), 0 2px 8px rgba(47,52,55,.04)"  # panneau modal
  overlay: "rgba(47,52,55,.28) + backdrop-filter blur(2px)"               # fond modal

components:
  button-primary:        # action principale — encre pleine, PAS l'accent
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: 11px 17px
    hover: "bg #1f2426"
  button-ghost:          # action secondaire — défaut
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.line}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    hover: "bg {colors.surface-2} + border #DAD7D1 + text {colors.ink}"
  button-danger:         # destructif confirmé
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    hover: "bg #872826"
  icon-btn:              # bouton icône nu
    textColor: "{colors.ink-3}"
    rounded: "{rounded.sm}"
    hover: "bg {colors.surface-2} + text {colors.ink}"
  status-dot:            # pastille d'état service
    on: "bg {colors.accent} + halo 0 0 0 3px {colors.accent-soft}"
    off: "bg #CFCDC7"
  card:                  # .services / .secrets-note / .topo-flow
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.md}"
  marker:                # chip pilule (flags, tags)
    backgroundColor: "{colors.surface-3}"
    border: "1px solid {colors.line}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.surface-2}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.sm}"
    focus: "border {colors.accent} + bg #fff"
  seg-option-active:     # segmented control sélectionné
    backgroundColor: "{colors.accent-soft}"
    border: "1px solid #CFE0CE"
    textColor: "{colors.accent}"

# Annexe — palette CLI (chalk), cohérente avec le web
cli:
  muted: "chalk.gray"     # meta, chemins, labels secondaires (couleur dominante)
  ok: "chalk.green"       # succès, état ON — équivalent {colors.accent}
  warn: "chalk.yellow"    # avertissements
  error: "chalk.red"      # échecs, destructif — équivalent {colors.danger}
  emphasis: "chalk.bold"  # titres, valeurs clés
---

## Overview

mcpwarden vit dans un **éditorial clair et calme** : un canvas bone chaud (`{colors.bg}` — `#F7F6F3`, jamais blanc clinique), de l'encre charbon (`{colors.ink}` — `#2F3437`, jamais `#000`), et **une seule couleur d'accent** — un **vert sobre** (`{colors.accent}` — `#346538`) réservé à l'état actif/OK, aux liens et au focus. Le rouge (`{colors.danger}`) est strictement le danger. Tout le reste est neutre (surfaces blanches/bone, lignes ultra-légères).

La typographie **mixe trois rôles** : **Newsreader** (serif) signe le nom de marque et les titres de panneau — la touche éditoriale ; **SF Pro Display** (sans) porte le corps et les labels ; **SF Mono** affiche tout ce qui est **donnée technique** (noms de services, identifiants, chemins, code, méta) — la signature « outil de dev ».

Identité **cohérente entre les deux surfaces** : la vue web (`serve`) et le CLI (chalk) parlent le même langage — vert = OK/actif, rouge = danger, gris = méta. Un état « service actif » est un point vert à halo sur le web et un `chalk.green` au terminal : même sémantique, deux médiums.

**Caractéristiques clés :**
- Canvas bone chaud + encre charbon — calme, lisible, jamais le couple blanc/noir froid.
- **Vert sobre = accent unique.** État actif/OK, liens, focus. Jamais décoratif, jamais en aplat de fond (sauf `accent-soft` en halo/surface active).
- Bouton primaire = **encre pleine** (charbon), pas l'accent vert — l'accent reste rare et signifiant.
- Mono pour toute donnée technique ; serif pour la marque ; sans pour le reste.
- Status par **point de couleur** (vert à halo / gris) — discret, pas de badge criard.
- Pilules (`marker`, `flag`) en `{rounded.pill}` ; cartes/panneaux en `{rounded.md}` ; contrôles en `{rounded.sm}`.
- Light color-scheme assumé (`color-scheme: light`), largeur de lecture `max-width: 920px`.

## Do / Don't (priment sur les goûts génériques)

> [!warning] Respecter la palette ne suffit pas — l'usage compte autant que les tokens.

**DO**
- Action principale = `button-primary` (encre pleine). Secondaire = `button-ghost`. Destructif = `button-danger`.
- Réserver le **vert accent** à l'état actif/OK, aux liens et au focus. Surfaces actives = `accent-soft` uniquement.
- Donnée technique (service, ID, path, code) = **toujours mono** (`{typography.data-mono}`).
- Marque + titres de panneau = **serif Newsreader**.
- Texte secondaire via la rampe d'encre (`ink-2`, `ink-3`), pas un gris hors-palette.
- CLI : `chalk.green` = OK, `chalk.red` = erreur, `chalk.yellow` = warn, `chalk.gray` = méta, `chalk.bold` = emphase. Pas d'autre couleur.

**DON'T**
- ❌ Aucune couleur hors palette (pas de bleu/violet/indigo) — marqueur « généré par IA ». Le code est à zéro fuite, le rester.
- ❌ Vert accent en aplat de fond ou comme couleur de bouton primaire — il perdrait son sens d'« actif ».
- ❌ Blanc pur pour le texte / noir pur pour l'encre — casse la chaleur bone+charbon.
- ❌ Mode sombre improvisé — le système est `color-scheme: light` assumé. Un dark mode = décision design séparée, pas une improvisation d'agent.
- ❌ Badges de statut colorés/criards — l'état se dit par un point discret.
- ❌ Empiler les niveaux de titre : marque (serif 30) → label de section (sans 13 semibold) → ligne. Pas d'inflation typographique.
- ❌ CLI : introduire `chalk.blue`/`cyan`/`magenta` ad hoc — rester sur la palette sémantique ci-dessus.

## Dette / divergences connues (corriger au fil de l'eau, ne PAS canoniser)

Audit de `template.html` : les tokens `:root` sont propres, mais plusieurs hex sont **hardcodés en ligne** au lieu d'être promus en variables. Aucune fuite de palette générique (bleu/violet) — juste des neutres/états non tokenisés :

- ~~`#F1EFEB` — fond de pilule/chip, répété 4× (`.marker`, `.pflag`, `.soon`, `.sl-ref`).~~ ✅ **Promu en `--surface-3` le 2026-06-26** — les 4 occurrences passent par `var(--surface-3)`, plus aucun hardcode.
- `#9A6B16` — couleur « warn » inline (`.result .warn`), alors qu'il n'existe **aucun token `--warn`**. À tokeniser si le warn devient récurrent (le CLI a déjà `chalk.yellow` comme équivalent → cohérence à établir).
- Neutres de hover/bordure hardcodés : `#1f2426`, `#DAD7D1`, `#E7CFCE`, `#FBF1F0`, `#872826`, `#CFCDC7`, `#CFE0CE`, `#C9C6BF`, `#D2D0CA`, `#B6B3AC`, `#D6D3CC`. Acceptables à court terme (états dérivés), à rationaliser si le système grandit.

> Note : ce DESIGN.md ne **corrige pas** le code — il documente. La promotion de `#F1EFEB` en token est un pass séparé (surgical), à faire seulement si tu valides.

## Source

Extrait le 2026-06-26 de `src/web/template.html` (`:root` + composants) et de l'usage `chalk.*` dans `src/commands/` + `src/core/`. Tokens 1:1 avec `template.html`. Spec amont ; le code exécute ; un pointeur `CLAUDE.md` (à ajouter) renverra ici avant toute UI.
