# design-sync notes — Character Sheet Design System

Project: `2de785d4-1811-432f-ba8f-84efb92b4108`
(https://claude.ai/design/p/2de785d4-1811-432f-ba8f-84efb92b4108)
Shape: **package** (synth-entry). Scope: the 5 domain-agnostic UI primitives
in `frontend/src/components/ui/` (Badge, Card, MeterBar, Modal, Tabs) + the
Tailwind `@theme` tokens. Feature components under `frontend/src/features/`
are intentionally NOT synced (data-coupled, app-specific).

## Why this repo needs custom inputs (it's an app, not a library)

The frontend is a Vite **application** — it builds an app bundle, not a `dist/`
of components, and has no published package entry or `.d.ts` tree. So:

- **Barrel entry**: `frontend/ds-entry.tsx` (committed) named-re-exports the 5
  default-export components. Passed via `--entry`; this makes PKG_DIR=frontend.
  `export *` would NOT carry default exports, hence explicit named re-exports.
- **Props come from `cfg.dtsPropsFor`** (hand-written), NOT extraction: the
  converter's ts-morph project only loads `.d.ts` files, and there are none, so
  auto-extraction yields empty bodies → stub → hard fail. **If a primitive's
  props change, update `cfg.dtsPropsFor.<Name>` by hand** (mirror the source
  interface; use `React.*` types — emit prepends `import * as React`).
- **CSS is compiled, not scraped.** Tailwind v4 is JIT, so there's no static
  stylesheet to ship. `.design-sync/tailwind-input.css` pulls in the app theme
  (`frontend/src/index.css`) + a remote Google Fonts `@import` and `@source`s
  the components + previews. Compile it to `frontend/.ds-compiled.css`
  (= `cfg.cssEntry`, gitignored), which the converter ships as `_ds_bundle.css`.
  Auto-detection also scans all of `frontend/src`, so the shipped CSS carries a
  broad real utility set (not just the 5 components' classes) — that's what
  lets the conventions header promise token utilities to the design agent.

  **Regenerate the CSS before every build** (and whenever a component or preview
  adds a class):
  ```sh
  node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs \
    -i .design-sync/tailwind-input.css -o frontend/.ds-compiled.css
  ```
  Tailwind version must match the app's (`tailwindcss` 4.3.1 at sync time);
  `@tailwindcss/cli@4.3.1` is installed in `.ds-sync` (gitignored).

## Fonts

Source Sans 3 + Source Serif 4 are the brand fonts, loaded the same way the app
loads them (a Google Fonts `<link>` in `index.html`) — shipped here as a remote
`@import` at the top of `tailwind-input.css`. Validate prints `[FONT_REMOTE]`
(informational, expected). "Iowan Old Style" is just an Apple system-serif
fallback in the stack — nothing to ship.

## Render check (Playwright)

No repo Playwright. A chromium build **1228** is cached at
`~/Library/Caches/ms-playwright/` (from the Playwright MCP server). Node
`playwright@1.61.0` pins exactly build 1228, so installing it into `.ds-sync`
reuses the cache with **no download**. On a fresh clone, re-run the dep install
(`cd .ds-sync && npm i esbuild ts-morph @types/react @tailwindcss/cli@4.3.1 playwright@1.61.0 playwright-core@1.61.0`).
If the cached chromium build differs, install the playwright release whose
`browsers.json` pins it (read it as a FILE — its exports map blocks `require`).

## Per-component overrides

- **Modal** is an overlay (portals to body, renders full-screen): `cardMode:
  single`, `viewport: 760x560`, `primaryStory: LedgerReview`. The garnet border
  in its card is the panel's real on-open focus ring — authentic, not a bug.
- **Tabs** `SectionSwitcher` is ~440px wide → `cardMode: column` (one story per
  row) so the product grid doesn't crop it.

## Known render warns (re-syncs: anything else is new)

- `[FONT_REMOTE]` — expected (remote brand fonts). Not a failure.

## States not previewed (static-render limits)

- Modal: focus-trap / Escape / backdrop-dismiss interactions (shown open only).
- Tabs/MeterBar are controlled; previews use a fixed/`useState` initial state.

## Re-sync risks (watch-list for the next run)

- **`dtsPropsFor` can silently drift** from the source interfaces — they're
  hand-mirrored. After any edit to a `ui/*.tsx` props interface, update the
  matching `cfg.dtsPropsFor` entry or the shipped `.d.ts` lies to the agent.
- **Forgetting to recompile `.ds-compiled.css`** before a build ships a stale
  stylesheet (missing newly-used utilities). Always run the compile step first.
- **Tailwind version skew**: if `tailwindcss` in the app bumps, bump the
  `@tailwindcss/cli` pin in `.ds-sync` to match, or generated utilities may
  differ from what the app renders.
- **Group is "primitives"** via `cfg.docsMap` category stubs (`.design-sync/docs/`).
  Removing those stubs would regroup all 5 to `general` and churn delete paths.
- Conventions header names specific utilities/tokens — re-validate them against
  a fresh `_ds_bundle.css` if the theme tokens change.

## Re-sync command

```sh
# 1. recompile CSS (see above)
# 2. fetch the project anchor → .design-sync/.cache/remote-sync.json (get_file _ds_sync.json)
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules \
  --entry ./frontend/ds-entry.tsx --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```
