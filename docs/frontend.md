# Frontend guidelines

## Directory structure — where things belong

Source of truth: `ls frontend/src/features` — regenerate if stale.

```
frontend/src/
├── components/
│   └── ui/              # domain-agnostic primitives (Card, Badge, MeterBar, Modal, Tabs, OverflowMenu, DropdownMenu, Popover, Avatar, ErrorBoundary, EmptyState, Spinner)
├── features/
│   ├── abilities/       # AbilityScoreBox, AbilityScoreEditor, SkillsTable, ProficienciesCard, AbilityScoresPanel
│   ├── advancement/     # AdvancementSection, AdvancementPanel (shell) → AsiFlow, FeatFlow,
│   │                    #   CustomFeatForm; hooks useAsiDraft/useFeatCatalog/useCustomFeatDraft; featView reducer
│   ├── auth/            # AuthProvider (useAuth), AuthGate, AppHeader, AccountMenu
│   ├── campaign/        # CampaignsPage (list+create; join is URL-only via /join/:code #520), CampaignDetailPage (mgmt hub with
│   │                    #   routed Overview/Codex + owner-only Manage tabs #367/#379), CampaignOverviewPanel (invite link,
│   │                    #   roster, add-character dropdown), CampaignInviteLink,
│   │                    #   CampaignIndicator (sheet badge/link), JoinCampaignRoute (#246),
│   │                    #   CampaignPreferencesPanel (per-campaign play prefs, sheet-only when attached #537)
│   ├── character-create/ # IdentitySection, AbilityScoresSection, SkillSection,
│   │                    #   ToolProficiencySection + useToolProficiencyChoices (CharacterCreatePage sections)
│   ├── character-meta/  # CharacterCard, VitalsStrip, JournalSection, JournalEntryPanel,
│   │                    #   ActivityModal, DeleteCharacterModal, BackendStatus,
│   │                    #   CharacterSheet{Header,Body,Modals}, CharacterLoadError (sheet-page sections)
│   │                    #   VitalsStrip's AC tile is read-only: a Popover disclosing the
│   │                    #   server-derived armorClassBreakdown verbatim (no client AC math)
│   ├── class/           # ClassFeaturesSection, FightingStylePanel, AddManeuverPanel,
│   │                    #   ManeuverRow, ResourcePoolRow, DisciplinesSection,
│   │                    #   DisciplineRow, AddDisciplinePanel (Four Elements monk),
│   │                    #   ShadowArtsSection, ShadowArtRow (Way of Shadow ki-cast),
│   │                    #   CloakOfShadowsSection (Way of Shadow L11 self-invisible toggle)
│   ├── conditions/      # ConditionsStrip, AddConditionPanel
│   ├── dice/            # DiceRoller, PhysicsDiceRoller, DiceScene, DieMesh, DiceRollSequence,
│   │                    #   DiceRollModal, RollButton, RollContext, RollResultToast, RollModeToggle,
│   │                    #   diceRollerTypes.ts, useDieFaceData.ts
│   ├── entities/        # CampaignCodex (Codex tab: the single entity list — browse/search/filter/create #367/#523),
│   │                    #   EntityList (shared search/filter/rows, #523), CampaignManagePanel (owner Manage tab:
│   │                    #   identity merges only #379/#523), EntityDetailPage (detail/edit/delete/reveal-hide + backlinks) (#248)
│   ├── experience/      # ExperienceTracker
│   ├── hitpoints/       # HitPointTracker orchestrator (inline Card; hosts LevelUpModal + ConcentrationSaveModal)
│   │                    #   Sub-components: HpActionControl (damage/heal/temp + optional
│   │                    #   damage-type picker + resistance auto-halve toggle, #456),
│   │                    #   HpMeter, RestControls, DeathSaveTracker, LevelUpCallout, AdvancementCallout
│   ├── inventory/       # InventoryList (Bag ⇄ Worn toggle), InventoryRow (→ InventoryEditForm/
│   │                    #   EquipToggle/AttuneToggle/ItemSummary/ItemProse), AddItemPanel, SellPanel,
│   │                    #   StartingEquipmentEditor, EquipmentDoll (→ EquipSlotCell → SlotPickerPanel)
│   ├── journal/         # CapturePalette (Cmd/Ctrl+J quick-capture NOTE overlay)
│   ├── session/         # TurnHub (→ useTurnActions + TurnControls/ActionSlot/BonusActionSlot/
│   │                    #   ReactionSlot/EffectManeuverStrip/LayOnHandsInput), useTurnState, SessionLog,
│   │                    #   SessionsModal, SessionSummaryModal, Inline{Attack,Item,Spell}Picker, ManeuverPrompt,
│   │                    #   AttackRow, EquipWeaponPanel, AttackOptionRow,
│   │                    #   useSpellPicker + SpellPickerRow/SlotLevelSelector/SpellTargetToggle,
│   │                    #   EndSessionPrompt, actionResolvers.ts, useActiveResolution, useManeuverDie,
│   │                    #   useSessionButton (sheet-header Start/Join/Resume session state)
│   ├── spells/          # SpellsSection, SpellRow, AddSpellPanel
│   └── theme/           # ThemeProvider (useTheme) — applies data-theme app-wide
├── hooks/               # reusable React hooks used by pages or multiple clusters
│   │                    #   (useCharacter, useCharacterList, useCharacterDraft, useReferenceData,
│   │                    #    useThemePreference, useGlobalKeyboard)
├── lib/                 # pure TS logic — NO React/JSX (dice, abilities, timeline, startingEquipment, …)
├── pages/               # route-level views (CharacterListPage, CharacterSheetPage,
│   │                    #   CharacterCreatePage, SessionPage, LoginPage, AboutPage)
├── api/
│   └── client.ts        # the only fetch() call site (apiFetch wrapper: credentials + 401)
├── types/
│   ├── character.ts     # shared domain types
│   └── auth.ts          # AuthUser, AuthProviderInfo
└── test/
    ├── setup.ts         # vitest/jsdom setup (jest-dom + jest-axe matchers + RTL cleanup)
    └── axe.ts           # re-exports jest-axe `axe` + vitest type augmentation
```

### Decision rule — "where does X go?"

Work through this checklist in order; stop at the first match:

1. **Pure logic, no JSX/React** → `lib/` (e.g. `lib/dice.ts`, `lib/abilities.ts`).
2. **A React hook** — used by multiple clusters or by a page → `hooks/`; used only within one feature cluster → co-locate it in that cluster (e.g. `features/dice/useDieFaceData.ts`).
3. **A component with no D&D knowledge** — no imports from `@/types/character`, no `@/api` calls, no game-rule logic, could ship in a different app unchanged → `components/ui/`.
4. **Any other component** → `features/<domain>/` (the cluster that owns it; create a new folder if none fits).
5. **Types** — used app-wide → `types/character.ts`; used by one cluster only → that cluster's folder.

### `lib/` — pure-logic inventory

Source of truth: `ls frontend/src/lib`. No React/JSX; all unit-testable in isolation.

| File | Purpose |
|---|---|
| `dice.ts` | The sole `Math.random` dice site — `rollDie`/`rollSpec`/`summarizeRoll`/`formatRollSpec` (see Dice engine below). |
| `abilities.ts` | Ability/skill/save labels + `abilityModifier` math; resolve all display keys through here. `skillBonus` takes an optional `tempModifier` for active buffs. |
| `items.ts` | `isEquippable(category)` + `EQUIPPABLE_CATEGORIES` — equippability rule (weapon/armor yes, consumable/gear no). Mirror of backend `lib/items.ts`; gate the Equip control through here, never inline-check `category`. Also `itemCategoryLabel` + `ITEM_CATEGORY_LABELS`/`ITEM_CATEGORY_ORDER`/`ITEM_CATEGORY_OPTIONS` — resolve category display through here, never a raw key. |
| `events.ts` | Activity-log display lookups — `eventTypeLabel`/`categoryLabel`/`categoryTone` (tolerant `Partial<Record>` maps, raw-key fallback) + `INVENTORY_EVENT_TYPES` for the filter chips. Resolve all event type/category keys through here, never inline-capitalize. |
| `timeline.ts` | Groups/formats audit events for the activity timeline (`groupByBatch`/`groupByDate`, generic over `{id,batchId,createdAt}`). |
| `currency.ts` | Copper-based currency math — `toCopper`/`fromCopper`/`splitLumpSum` + `formatCurrency` (unsigned, largest-first denomination string). |
| `sellBatch.ts` | `summarizeSellBatch` collapses a bulk-sale batch (>1 row, all `sold`) into one line summary for ActivityModal; returns `null` for non-bulk-sale batches. |
| `bulkSell.ts` | Bulk-sell math. `buildSellOperations` (per-line `quantity` + `perItem`/`lumpSum` pricing); `defaultSellPrice` (half per-unit catalog value, rounded down, × qty); `resolveSellPrices` (single sale total + per-line pin overrides → per-line `Currency`, pinned lines exact + the rest split evenly, gp/sp/cp with **no** platinum roll-up); `gpToCopper`/`copperToGp` for the single decimal-gold input. Consumed by `SellPanel`/`InventoryList`; distinct from `sellBatch.ts` (which summarizes a completed batch). |
| `startingEquipment.ts` | Character-creation equipment helpers (`isPackageComplete`, `isGoldValid`, `EquipmentDraft`). |
| `paperDoll.ts` | Paper-doll slot taxonomy + placement rules for the Worn view (#566) — `allowedSlotsForItem` (mirrors the backend), `itemsInSlot`, `bagItemsForSlot`, `isOffHandLocked`, `equipSlotLabel`, `SLOT_GROUPS` (Hands/Armor/Adornment). Also the single source for the DM gear slot-authoring picker (#572): `WORN_SLOTS` (the eight worn slots, excluding the derived MAIN_HAND/OFF_HAND/BODY) + `wornSlotItemKindLabel`/`WORN_SLOT_ITEM_KIND_LABELS` (item-kind names — "Gloves" for HANDS, "Bracers" for WRISTS). |
| `characterCreationValidation.ts` | Explains *why* the creation Save button is disabled (`missingRequirements`). |
| `abilityGen.ts` | Ability-score generation methods (point-buy / standard array / roll). |
| `dieFaces.ts` | Static die-face geometry data for the 3D rollers. |
| `physicsDice.ts` | Physics-roller setup (cannon/three glue) for `PhysicsDiceRoller`. |
| `effects.ts` | Mirror of backend `lib/effects.ts` (keep in sync) — the 5e effect model (dice + save + scaling). `readEffectSpec(row)` adapts the flat effect columns into an `EffectSpec`; `resolveEffectSpec(spec, effectiveStep, ctx)` returns a concrete `RollSpec`, generalizing the scaling axis (`cantripLevel`/`slotUpcast`/`ki`). Includes the `buff` EffectType mirrored from the backend. `spellCast.ts` + `spellMeta.ts` both delegate here — never re-copy the scaling math. |
| `spellCast.ts` | Pure cast-roll math shared by SpellsSection + InlineSpellPicker. `computeCastSpec` derives the spellcasting ability mod then delegates the scaling/heal math to `resolveEffectSpec` (`lib/effects.ts`). |
| `spellMeta.ts` | Pure spell display helpers (school tone, metadata, `defaultTarget`/`targetLocked`, `effectPreview`/`effectPreviewWithMod`) shared across spell surfaces. The effect-preview count/modifier come from `resolveEffectSpec` (`lib/effects.ts`); this file only formats the label. `Target` is `"self" \| "other" \| AllyOption`; `partyHealAllies(session, selfId)` derives the opted-in ally list a healing cast can target — present participants sharing the campaign with `autoFriendlyHealing` on (#462). `SpellTargetToggle` renders those allies (vs. self/other for damage) and `useSpellPicker` sends the pick as `apply.target: { characterId }`. |
| `spellPicker.ts` | Pure InlineSpellPicker selection/slot predicates (`availableSlotLevels`, `availableSlotsForSpell`, `resolvedSlot`, `filterCastableSpells`, `sortSpells`, `spellRestrictionFlags`, `slotRestrictionHint`). |
| `turnRules.ts` | 5e turn economy — universal action lists + `canTwoWeaponFight`. (Extra Attack counts are server-derived; read `character.attacksPerAction`.) |
| `attackMath.ts` | Pure attack-row math for InlineAttackPicker: `buildAttackEntries` (equipped/unarmed/improvised rows + precomputed roll/log label strings), grip-resolved weapon damage/type/grip helpers, unarmed display, `hasSuperiorityDice`, `attacksExhausted`. **Dice-valued item damage riders (#547):** `weaponDamageRiders(item)` collects an active item's dice-valued `add`-op `damage` passiveBonus caps as typed `DamageRider`s (each keeps its own damage type; a `condition` becomes self-announce reminder text), rolled as separate damage terms at attack time; `capabilitiesActive(item)` is the frontend activation gate (attunement-required item needs attunement, others equip — mirrors backend `isItemActive`). |
| `mentions.ts` | @-tagging primitives (#248/#269): `parseMentionBody` (text/mention segment split of a stored body), `normalizeForMatch` (search key, parity with backend `lib/journal-refs.ts`), `matchEntities`, `parseTrigger` (the in-progress `@…`/`@type:` autocomplete trigger). Edit-time DOM helpers (contenteditable composer): `mentionBodyToFragment` (body→DOM with chips), `serializeMentionDom` (DOM→body round-trip), `serializeMentionDomBeforeCaret` (pre-caret slice for trigger parsing), `placeCaretAtBodyOffset`, plus the `MentionResolved` type. Pure — no JSX. |
| `encumbrance.ts` | Carrying capacity (`carryingCapacity` = STR × 15) and coin weight (`coinWeight(currency)` = total coins ÷ 50 lb, PHB p.143), both derive-on-read. |
| `itemDetails.ts` | Pure inventory-row presentation: `itemDetailParts` (the dotted summary line), `hasItemProse`. Shared by InventoryRow/ItemSummary. |
| `fightingStyles.ts` | Fighting-style labels/descriptions (presentation; backend is rules source of truth). |
| `damageTypes.ts` | The standard 5e `DAMAGE_TYPES` list + `damageTypeLabel` (populate the HP damage-type picker) and `activeResistedDamageTypes(buffs)` — the self-scoped resistance registry that drives the auto-halve preview (#456). Mirrors the backend helper of the same name. |
| `multiclass.ts` | Multiclass display + gating helpers: `isMulticlass`, `classSummary` (single-class → name unchanged; multiclass → "Wizard 5 / Cleric 3"), `multiclassPrereqMet` (evaluates the backend-served `ClassOption.multiclassPrerequisite` thresholds against the character's scores — no rules table duplicated). Feeds `CharacterSheetHeader`/`CharacterCard`/`ClassFeaturesSection`, `AddClassPanel`, `LevelUpModal`. |
| `disciplines.ts` | Four Elements ki rules (mirror of backend): `maxKiPerDiscipline` cap, base-cost/scaling reads, `disciplineKiOptions` selector range, and `disciplineRollSpec` (ki-scaled effect roll). Feeds `DisciplineRow`/`DisciplinesSection`. |
| `conditions.ts` | 5e condition labels/descriptions for the chip strip + picker. |
| `rarity.ts` | Item-rarity presentation (mirror of backend `srd.ts` `ITEM_RARITIES`, #497): `ITEM_RARITY_LABELS`/`rarityLabel` (resolve display through here, never a raw `VERY_RARE` key), `RARITY_OPTIONS` (dropdown, ascending tiers), `rarityTone` (Badge tone per tier), and `standardValueForRarity`/`rarityValueHint` (derived gp hint — consumable halves, Artifact priceless). Feeds `CampaignItemsPanel` + `CampaignItemCard`. |
| `capabilities.ts` | Item-capability presentation (mirror of backend `lib/capabilities.ts`, #546): `CAPABILITY_TARGET_OPTIONS`/`CAPABILITY_OP_OPTIONS`/`ATTUNEMENT_PREREQ_OPTIONS`/`CHARGE_TRIGGER_OPTIONS` (authoring pickers), `targetUsesSkillKey`/`targetUsesAbilityKey` (which targets name a skill/ability via `targetKey`), `capabilitySummary` (one-line bonus, e.g. "+2 Stealth" / "+2d6 fire Damage (when on hit)" — resolves `targetKey` through `skillLabel`/`abilityLabel`, never a raw key), `chargesSummary` ("7 charges · regains 1d6+1 at dawn", #555), a cost-aware `castSpellSummary` ("costs 3 charges" when `resource === "charges"`), and `describeAttunementPrereq`. Feeds `CapabilityEditor`, `AttuneToggle`, `ItemSummary`. |
| `activatedEffect.ts` | Display labels for an `activatedEffect` capability's activation type — `activationLabel`/`ACTIVATION_LABELS` (action/bonus/reaction/commandWord), mirroring the backend `describeActivation`. Feeds `ActivateControl`. |
| `characterSections.ts` | Sheet-section visibility predicates (`hasProficiencies`/`hasAdvancements`) — the inline card-gate expressions from CharacterSheetPage. |
| `formatJournalDate.ts` | Formats ISO journal dates in UTC ("Jun 22, 2026"). |
| `advancement.ts` | `entryDetail` — pretty-prints an AdvancementEntry's ASI/feat effects for AdvancementSection's list view. |

### `@/` path alias

`@/` maps to `frontend/src/`. Configured in `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`); Vitest inherits it automatically from Vite.

```ts
// ✓ Always use @/ for cross-file imports
import Badge from "@/components/ui/Badge";
import { useCharacter } from "@/hooks/useCharacter";
import type { InventoryItem } from "@/types/character";

// ✗ Never use relative ../ paths — they break on moves and are hard to grep
import Badge from "../../components/ui/Badge";
```

Use `@/...` for **every** source import — including same-folder siblings — so paths survive component moves and remain grep-able. The only exceptions are asset side-effect imports in `main.tsx` (e.g. `import "./index.css"`).

## Tailwind v4

**Setup**: loaded via `@tailwindcss/vite` in `vite.config.ts`. No `tailwind.config.js` or `postcss.config.js` — this is correct v4 practice; do not add them. The only Tailwind setup is `@import "tailwindcss";` in `frontend/src/index.css`.

**Named utilities work normally.** Named size utilities (`max-w-xl`, `max-w-6xl`, `w-96`, `h-24`, etc.) and numeric spacing (`p-4`, `gap-2`, `w-14`) all resolve correctly in Tailwind 4.3.1.

**Prefer idiomatic utilities over verbose arbitrary values.** Custom `@theme` tokens auto-generate idiomatic Tailwind classes — use these:

```tsx
// ✓ Idiomatic (preferred)
<div className="text-garnet-700 bg-parchment-50 rounded-card shadow-card">

// ✗ Verbose (legacy, avoid for new code)
<div className="text-[var(--color-garnet-700)] bg-[var(--color-parchment-50)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)]">
```

Genuine non-token values still use arbitrary syntax: `text-[11px]`, `max-h-[80vh]`, `max-w-[36rem]`.

**Footgun:** never reintroduce bare `--spacing-{name}` tokens — see the Tailwind non-negotiable in CLAUDE.md.

## Design tokens

Token definitions live in `frontend/src/index.css` (`@theme` block). For a full reference of color families, typography, spacing, radius, and shadow scales, see:

**`.claude/agent-memory/frontend-design-architect/design_system.md`**

Summary of what's available:
- Colors: `--color-parchment-{50..900}`, `--color-garnet-{50..900}`, `--color-arcane-{50..900}`, `--color-gold-{50..900}`, `--color-vitality-{50..900}`
- Fonts: `--font-display` (Source Serif 4, headings), `--font-sans` (Source Sans 3, body/UI)
- Radius: `--radius-card` (0.625rem), `--radius-control` (0.375rem) — just two, used everywhere
- Shadows: `--shadow-card`, `--shadow-raised`
- Texture (#228): `--texture-grain` (inline-SVG fractal-noise data-URI) plus per-theme `--texture-blend`/`--texture-page-opacity`/`--texture-card-opacity`. A fixed `body::before` paints the page-canvas grain; the `.surface-grain` class (on `Card`) paints a faint `::after` grain clipped to the card radius. Both are `pointer-events:none`. See `design_system.md`.

Use idiomatic utility classes — tokens auto-generate them in v4: `text-garnet-700`, `bg-arcane-50`, `rounded-card`, `shadow-raised`. Only fall back to `[var(...)]` syntax for non-token one-off values.

**Text-contrast policy (WCAG AA).** On the `parchment-50` background nothing lighter than `parchment-600` clears 4.5:1, so **readable text uses `parchment-600` or darker** (`-600` secondary, `-700`/`-900` primary). `text-parchment-400`/`-500` are **reserved for WCAG-exempt uses only** — `placeholder:`, `disabled:`, and decorative `aria-hidden` glyphs — never for content text. Don't reintroduce `-400`/`-500` on readable text (see #158/#98). The same 4.5:1 floor applies to **accent text on light surfaces**: `gold` ≥ 800, `arcane` ≥ 700, `garnet` ≥ 600 (bump one step darker on a tinted fill, e.g. `arcane-800` on `bg-arcane-100`) — the mid steps (`gold-700`, `arcane-600`, `garnet-500`) fail as text. Lighter accent steps are for fills/borders/meters, not text (see #187/#207). The mirror rule applies to **light text on an accent fill** — it must also clear 4.5:1, so only the darker accents can carry white: `garnet-600` (≈5.5:1) and `vitality-600` (≈4.9:1) do; `arcane` carries white only from `arcane-700` down (`arcane-600` ≈3.8:1, `arcane-700` ≈5.07:1, hover `arcane-800` ≈6.44:1); and **gold can never carry white** (`gold-800` technically passes at ~6:1 but reads muddy), so filled gold flips to **dark text on a bright fill** on `bg-gold-400` (hover `bg-gold-500`) (see #207). **Dark mode (#211/#213): a label token on an accent fill must co-flip with its fill or stay fixed.** Garnet/arcane/vitality fills **invert** between modes, so their labels use **`text-parchment-50`** (near-white in light, near-black in dark) — never hard-coded `text-white`. Gold is light-ish in **both** modes, so its label uses **`text-ink`** (the fixed `--color-ink` #27241d that never flips), ≈10.5:1 light / ≈5.6:1 dark — never `text-parchment-900` (which flips light in dark and fails AA). Full rationale in `design_system.md`.

### Design gate

Staying on-system is what keeps the UI from reading as generic. The `verify-frontend` skill runs a **design-review lane** (the `frontend-design-architect` agent — or a `general-purpose` agent briefed with the design docs if that type isn't available — plus the `/ux-review` skill for whole-page changes when it's installed) alongside unit tests and browser verification. It judges changes against this token set and the conventions in this doc — off-token colors/radii/shadows, broken hierarchy, reinvented primitives, and raw skill/ability keys are `blocking` findings that fail the gate; subjective polish is `advisory`. Run `/verify-frontend` before opening a frontend PR (it's also invoked automatically by `/parallel-issues`).

## UI pattern: inline panels vs Modal overlay

**Rule**: `Modal.tsx` (portal + focus trap + Esc + backdrop) is reserved for **read-only review surfaces and confirm dialogs**. Every add/edit surface is an **inline expand-in-place panel within its Card**.

| Modal | Inline panel |
|---|---|
| `ActivityModal` — filterable audit timeline (category + session selects + inventory type chips; optional `entityId` scope) + undo — also serves as inventory history | `AddItemPanel` — add item form |
| `DeleteCharacterModal` — confirm destructive action | `AddSpellPanel` — learn spell form |
| `LevelUpModal` / `ConcentrationSaveModal` — hosted *inside* `HitPointTracker` | `InventoryRow` edit mode |
| `DiceRollModal` — read-only 3D roll result, hosted *inside* `RollProvider` (skill/ability/save/initiative rolls) | |
| | `SellPanel` — bulk-sale confirm/review (per-line qty + one sale total that splits evenly; optional per-line price override) |
| | `HitPointTracker` itself — inline Card (damage/heal/rest/death-save controls) |
| | `ExperienceTracker` award/set inputs |
| | `AbilityScoreEditor` method tabs |

When adding a new editing surface: **default to inline**. Reach for `Modal` only if the surface is read-only or a destructive confirmation. If you need an overlay for an editing surface, make the case explicitly.

## Primitive components

These live in `src/components/ui/` and are intentionally domain-agnostic — they must not import from `@/features`, `@/api`, or `@/types/character`. They know nothing about D&D.

| Component | Usage |
|---|---|
| `Card` | Base parchment surface for every major section. Props: `title?`, `titleAccessory?`, `className?`, `headingLevel?` (`2`\|`3`, default `3` — set `2` when the card is a top-level page section directly under the page's `h1` so heading order doesn't skip). |
| `Badge` | Soft-background pill. Prop `tone`: `garnet` / `arcane` / `gold` / `vitality` / `neutral`. |
| `MeterBar` | Horizontal resource meter. Always pair with numeric text (e.g. `9/10 HP`) — never rely on color alone. Prop `tone`: `garnet` / `arcane` / `gold`. |
| `Modal` | Overlay primitive. See inline-vs-modal rule above. |
| `Tabs` | Controlled segmented-control tab switcher (WAI-ARIA tablist, arrow-key nav, optional per-tab `badge`). Renders only the switcher; the caller renders the active panel below it. Props: `tabs`, `active`, `onChange`. |
| `OverflowMenu` | Icon-only kebab (`MoreVertical`) menu-button (WAI-ARIA menu-button: `aria-haspopup`, roving tabindex, Arrow/Home/End/Esc nav, click-outside to close, focus returns to trigger). No portal — `relative`-anchored popup. Per-item `danger?` (garnet) / `separatorBefore?` (divider). Props: `items`, `label?` (trigger accessible name, default "More actions"), `className?`. |
| `DropdownMenu` | Owned-trigger popup menu for **arbitrary** content (vs `OverflowMenu`'s fixed item array). Owns the `<button>` and takes the trigger as `trigger` content; `children` is a render-prop `(close) => ReactNode`. Keyboard nav (Arrow/Home/End + roving tabindex) is driven by a **live** `[role^="menuitem"]` DOM query (covers `menuitemradio`/`menuitemcheckbox`), so presentational rows carry no role and are skipped for free. `aria-haspopup`/`aria-expanded`, ArrowDown/Enter/Space opens, Esc + click-outside close, focus returns to trigger. No portal — `relative`-anchored. Props: `trigger`, `label` (trigger accessible name), `children`, `align?` (`right`\|`left`, default `right`), `className?`. |
| `Popover` | Owned-trigger **disclosure** popover for read-only detail panels (vs `DropdownMenu`'s menu semantics — no menuitems, no roving focus). Trigger gets `aria-haspopup="dialog"`/`aria-expanded`; panel is `role="dialog"` (focused on open), Esc closes and refocuses the trigger, click-outside and re-click close. No portal — `relative`-anchored. Props: `trigger`, `label` (trigger + dialog accessible name), `children` (a `ReactNode`, or a render fn `(close) => ReactNode` so panel controls can dismiss the popover), `align?` (`left`\|`right`, default `left` — the *preferred* side: on open, a `useLayoutEffect` measures the anchor + panel against `documentElement.clientWidth` and auto-flips to the opposite side if the preferred one would overflow the viewport horizontally, e.g. a right-column paper-doll slot on mobile; recomputed on window resize while open), `className?`, `triggerClassName?` (style the owned button, e.g. as a stat tile), `onClose?` (fires on every open→closed transition). |
| `Avatar` | Circular identity badge. Renders `<img alt="">` when `imageUrl` is set, else initials (up to two from `name`, then the `email` initial, then `?`). Decorative — the accessible label lives on the trigger. Props: `name`, `email`, `imageUrl` (all primitive, nullable), `className?` (default `h-8 w-8`). |
| `ErrorBoundary` | Class error boundary wrapping the route tree in `App.tsx`. Catches render-time crashes and shows a parchment "something went wrong" fallback (Reload / Back to characters) instead of a blank page. Optional `fallback?: (error, reset) => ReactNode` for custom recovery UI. |
| `EmptyState` | Warm zero-state: decorative hero icon (pass a game-icon from `icons.ts`) + `font-display` title + optional `description` and `action` CTA. Prop `size`: `md` (card-body, default) / `sm` (in-card strip). Used for empty journal / inventory / spellbook / conditions. |
| `Spinner` | Loading indicator (`role="status"` + visually-hidden "Loading…"). Prop `variant`: `page` (larger, centered in a full-screen `min-h-screen` container) / `inline` (small, centered in its block, default). **Always gate it with `useDelayedFlag`** (see Loading pattern below) so it only appears for genuinely slow loads — fast loads must render nothing, never a flashing spinner or text. |

### Form primitives (#542)

Token-styled, controlled building blocks for authoring forms. `Input`/`Textarea`/`Select` share `controlClass` (exported from `Input`) so every control surface matches; numeric inputs keep an explicit `text-parchment-900` for dark-mode legibility.

| Component | Usage |
|---|---|
| `Field` | Label + control + hint/error wrapper. Props: `label`, `htmlFor?`, `hint?`, `error?` (error takes precedence over hint), `required?`. Wrap any control to get consistent label + helper-text layout. |
| `Input` / `Textarea` / `Select` | `forwardRef` wrappers over the native element, pre-styled with the shared `controlClass` (Textarea adds `resize-y`). Spread all native attributes. Reach for these instead of hand-rolling `className={inputCls}`. |
| `Segmented` | Single-select segmented control (WAI-ARIA `radiogroup`, roving tabindex, Arrow/Home/End nav), styled like `Tabs`. Generic over the value union. Props: `options` (`{value,label}[]`), `value`, `onChange`, `label`. Use for a small, mutually-exclusive choice (category, weapon class) instead of a `Select`. |
| `ChipToggle` / `ChipGroup` | `aria-pressed` pill toggle + a labelled wrapping `role="group"` row. Use for a set of independent booleans (weapon/armor property flags) instead of a stack of checkboxes. |
| `Disclosure` | Collapsible section: a disclosure button (`aria-expanded`/`aria-controls`) revealing a region. Use to tuck advanced/rarely-touched fields (e.g. the coin breakdown) behind progressive disclosure. |
| `DiceInput` | Compound `NdF (+M) [type]` dice control (own `DiceValue` type). Props: `value`, `onChange`, `label`, `idPrefix`, `showModifier?`, `showType?`. Numeric segments force `text-parchment-900`. Use anywhere a form edits a decomposed roll spec. |

The campaign item form (`features/entities/CampaignItemsPanel.tsx`) is the reference consumer: it recomposes into five labelled fieldsets (Identity, Category details, Magic, Value & weight, Description + DM notes) with progressive disclosure — the versatile die and range appear only when relevant, the coin breakdown lives behind a `Disclosure`, and attunement/unique + the rarity value hint show only for a non-Mundane rarity. Category details also carries the worn-slot authoring UI (#572): a `Slot` `Select` (from `WORN_SLOTS`/`wornSlotItemKindLabel`, defaulting to "Carried (not worn)" → `slot: null`) appears only for gear, while weapon/armor show a read-only "Equips to: …" line derived from `allowedSlotsForItem`; switching category away from gear clears the chosen slot in form state (mirrors the backend clear in #571).

## Iconography — `components/ui/icons.ts`

All icons resolve through `components/ui/icons.ts`. Two libraries: `lucide-react` for UI chrome (kebab, chevron, search, +/−/✕) and `react-icons/gi` (game-icons) for D&D flavor (abilities, item categories, empty-state heroes). Always use per-icon subpath imports (`lucide-react`, `react-icons/gi`) — never `react-icons/all`. Domain→icon lookups are typed `Record<…, IconType>` maps (`ABILITY_ICONS`, `ITEM_CATEGORY_ICONS`) so a missing/renamed key is a compile error; `icons.ts` is the single allowed `components/ui` file that imports `@/types/character` for exactly this reason. Icons are monochrome `currentColor`: never set `fill`/hex — give the icon a parent with a `text-*` token so it works in light and dark. Decorative icons get `aria-hidden="true"`; icon-only buttons keep their `aria-label`. **No colorful emoji in the UI** (#496): render a lucide/game-icon component instead — e.g. `Lock` for a Hidden/DM-notes badge, `Plus` on New/Create buttons, `Zap` for the Action Surge accent, `VenetianMask` for secret-identity merges. The barrel re-exports these lucide names (`Lock`/`Plus`/`Zap`/`VenetianMask`) alongside the game-icons. Monochrome text glyphs are fine and intentionally kept: the `✕` close control and the `⚑` future-feature marker.

## Loading — delay-gated, never flashing

Loading indicators are **delay-gated**: a fast fetch (the common case) must render
**nothing** — no text, no spinner — so it can't flash up and vanish. Only a load
still pending after a threshold shows feedback. The mechanism is one hook,
`hooks/useDelayedFlag.ts`:

```ts
const showSpinner = useDelayedFlag(isLoading);   // true only after isLoading
…                                                 // stays true for 400ms (default)
{isLoading && (showSpinner ? <Spinner /> : null)}
```

`useDelayedFlag(active, delayMs = 400)` returns `true` only once `active` has been
continuously `true` for `delayMs`, and resets to `false` immediately when `active`
clears. Feed it the existing "is loading" expression (e.g. `character === undefined
&& !error`, `catalog === null && !catalogError`); keep the surrounding
loading/error/empty/content branching unchanged — only the indicator JSX is gated.
Pair it with the `Spinner` primitive: `variant="page"` for full-screen route loads
(centered), `variant="inline"` (default) for loads inside an already-rendered
panel/modal. **Never** render bare `Loading…` text as a stand-in for a spinner.

## API calls — `client.ts` is the only call site

All `fetch` calls go through `frontend/src/api/client.ts`. **Never call `fetch` directly from a component.**

When adding a new backend endpoint:
1. Add the function to `client.ts` — delegate to the generic `request<T>(path, init, "Failed to …")` (JSON reply) or `send(path, init, "Failed to …")` (void/204), so you inherit the shared ok-check/error-parse/throw flow instead of re-hand-rolling it. Intent-bearing `…/transactions` endpoints go through `postTransactions`.
2. Import it in the component

This keeps all URL construction, error handling, and type casting in one place.

Every domain call goes through `apiFetch`, which adds `credentials: "include"`
(so the `cs_session` cookie flows cross-origin in dev: 5173 → 4000) and routes
any **401** to a single registered handler — `setUnauthorizedHandler` — instead
of per-call handling. `AuthProvider` registers that handler to drop auth state to
anonymous (the router then shows login). The auth bootstrap `fetchMe` uses a
plain credentialed `fetch` so its expected 401 ("not signed in") doesn't trip
the global handler. Auth functions: `fetchAuthProviders`, `fetchMe`, `logout`.

## Auth — `features/auth/`

OAuth-only (no passwords). Pieces:
- **`AuthProvider.tsx`** — context (`useAuth`): bootstraps from `fetchMe`
  (`loading → authenticated | anonymous`), exposes `user` + `logout()`, and
  registers the client's unauthorized handler.
- **`AuthGate.tsx`** — renders the app only when authenticated; a loading
  placeholder during the probe; `LoginPage` for anonymous (so a 401 anywhere
  lands on login, never a white screen).
- **`AppHeader.tsx`** — slim chrome that renders only the avatar-triggered `AccountMenu`.
- **`AccountMenu.tsx`** — composes `DropdownMenu` + `Avatar`; the avatar is the trigger. The open panel holds a presentational identity row (name + email, no `menuitem` role), an **Appearance** section (three `menuitemradio` rows Light/Dark/System with lucide `Sun`/`Moon`/`Monitor` icons; the active one is `aria-checked` + `Check`-marked; selecting calls `setPreference` and does not close the menu), and a danger Log out `menuitem` (calls `logout()` then `close()`).
- **`pages/LoginPage.tsx`** — buttons are **data-driven** from
  `GET /api/auth/providers` (each a plain anchor to its `startUrl`), so enabling
  a provider server-side needs no frontend change.

`App.tsx` order: `BrowserRouter → ErrorBoundary → ThemeProvider → AuthProvider →
AuthGate → (AppHeader + Routes)` — ErrorBoundary stays outermost over the app
content; ThemeProvider wraps auth so `data-theme` applies app-wide.

## Theme / dark mode — `features/theme/`

Dark mode is a set of `--color-*` overrides under `[data-theme="dark"]` in
`index.css` (the dark palette uses reversed ramps + dark shadows + a
`--color-backdrop` token; #211 — see `design_system.md`; light mode is
unchanged). The preference is persisted at `localStorage["cs:pref:theme"]`,
defaulting to `system`.

- **`hooks/useThemePreference.ts`** — pure persistence + resolution:
  `ThemePreference = light | dark | system`, `loadThemePreference` /
  `saveThemePreference`, `getSystemTheme` (via `matchMedia`), `resolveTheme`, and
  the `useThemePreference` hook (a `useState`-shaped pair).
- **`features/theme/ThemeProvider.tsx`** — context (`useTheme`): exposes
  `{ preference, resolved, setPreference }` and writes the resolved theme onto
  `document.documentElement.dataset.theme`; while on `system` it re-resolves on
  OS `prefers-color-scheme` changes.
- **`index.html`** — a tiny blocking inline script applies `data-theme`
  pre-paint to avoid a flash of the wrong theme (the storage key is duplicated
  there from `useThemePreference.ts`).
- **`AccountMenu.tsx`** — hosts the direct theme selector: an Appearance section
  with Light/Dark/System `menuitemradio` rows that pick a `preference` directly
  (no cycling), inside the account dropdown.
- Input/control surfaces use `bg-parchment-50` (never `bg-white`) so they flip in dark mode; paired `text-parchment-900`/`placeholder:text-parchment-400` tokens already flip (#212).

## Dice engine

`frontend/src/lib/dice.ts` is the **only** place `Math.random` is called for dice. Key exports:

```typescript
rollDie(faces: number): number          // the sole Math.random call
rollSpec(spec: RollSpec): RollResult    // rolls all dice + sums + applies modifier
summarizeRoll(values, spec): RollResult // for when values come from outside (physics roller)
formatRollSpec(spec): string            // "3d6 + 2", "4d6 drop lowest", "1d20 + 5 (advantage)"
usesAdvantage(spec): boolean            // the advantage/disadvantage guard (below)
```

`RollSpec`: `{ count, faces, modifier?, dropLowest?, mode? }`.

**Advantage / disadvantage** (`mode?: "normal" | "advantage" | "disadvantage"`, #459). `rollSpec` honors `mode` **only for a single d20** — the `usesAdvantage` guard requires `faces === 20 && count === 1`, so multi-die damage specs (`2d6`) and non-d20 dice ignore `mode` and roll normally. An advantage roll rolls **2d20** and keeps the higher (disadvantage: the lower); the un-taken die stays in `RollResult.dice` flagged `dropped: true` (same mechanism as `dropLowest`) so toast + 3D can show both dice. Ties keep exactly one die.

The manual toggle is `features/dice/RollModeToggle.tsx` — a sticky Normal/ADV/DIS control (mounted alongside `RollResultToast` in `CharacterSheetPage`/`SessionPage`) that sets `mode` in `RollContext`; `roll()` merges that mode into every eligible spec (a caller-pinned `spec.mode` wins). `RollResultToast` shows both dice (dropped one struck through), an Advantage/Disadvantage label, and keeps natural-20/1 highlighting on the **taken** die; `DiceRoller` renders both d20s.

**Roll affordances → `RollContext`.** `RollProvider` (mounted once per page in `CharacterSheetPage`/`SessionPage`) exposes two roll paths that share the sticky `mode`:
- `roll(spec, label)` — instant fast-roll (no 3D). Used by the in-combat attack/damage/spell pickers, which run their own `logRoll` calls.
- `rollAnimated(spec, label, log?, onSettled?)` — plays the 3D `DiceRollModal` overlay, publishes to `RollResultToast`, and (when `log` is set) emits the roll's category event. This is what `RollButton` uses, so the sheet's **skill checks** (`SkillsTable`), **ability checks + saving throws** (`AbilityScoreBox`), and **initiative** (`VitalsStrip`) all animate and log via the `log={{ kind, source, ability?, skill?, dc? }}` prop (#460). `onSettled(result)` fires with the settled `RollResult` so a caller can apply the exact **shown** roll server-side — `UseConsumableButton` (#121) uses it to forward a consumable's rolled effect-die values via the `use` op's `rolls`, so the animated roll equals the applied heal.

`logSessionRoll` is the shared **best-effort** logging path (a no-op unless `RollProvider` was given both `characterId` and an active `sessionId` — rolls only log inside a session, like attack/damage). `ConcentrationSaveModal` calls it directly so a manual concentration CON save reaches the Session Log as a `saveRoll` too. `RollProvider`'s `onRollLogged` bumps the session-log refresh key.

**3D rollers** (`features/dice/DiceRoller.tsx` scripted, `features/dice/PhysicsDiceRoller.tsx` physics) both produce a `RollResult` shape via `summarizeRoll` — they're interchangeable via the shared `DiceRollerProps` contract in `features/dice/diceRollerTypes.ts`. In tests, stub `@/features/dice/DiceRoller` (it mounts a Three.js Canvas that won't render in jsdom) to fire `onResult` on mount — see `RollContext.test.tsx` / `ConcentrationSaveModal.test.tsx`.

**Lazy 3D stack (#432).** The three.js/@react-three/cannon-es/troika stack is heavy, so it never sits in the initial bundle. The two dice seams on eager pages load it via `React.lazy` behind `<Suspense fallback={null}>` — `RollContext` lazy-loads `DiceRollModal`, and `ConcentrationSaveModal` lazy-loads `DiceRoller` — so the vendor chunk is fetched only when a roll animates. Character creation's `PhysicsDiceRoller` rides the route-lazy `CharacterCreatePage` chunk instead. Because the tests stub `@/features/dice/DiceRoller` and the lazy import resolves a tick later, assert the roller with `findByTestId` (async), not `getByTestId`. See the Bundle splitting note below for the matching `manualChunks` config.

The dice face numbers are drei `<Text>` (troika). Two things keep them working under the single-origin CSP (#408), which local split-origin dev never exercises:
- **Main-thread typesetting** — `lib/troikaTextConfig.ts` (`configureDiceText()`, run at module scope in `features/dice/DiceScene.tsx` so it fires when the lazy dice chunk evaluates, before any `<Text>` renders — kept out of `main.tsx` so it doesn't pin troika into the initial bundle, #432) sets troika `useWorker: false`. Troika's default worker rehydrates via a `blob:` `importScripts`, which the CSP `script-src` blocks (`worker-src` doesn't cover `importScripts`), so `<Text>` would otherwise suspend forever and stall the whole roller.
- **Bundled font** — `DieMesh` passes an explicit `font` (a same-origin `@fontsource/source-sans-3` **woff**, imported so Vite hashes it into `dist`). Without it, main-thread troika fetches unicode-font-resolver data from a CDN, which the CSP `connect-src` blocks. woff, not woff2 — troika's parser can't read woff2.

Defense-in-depth: `DieMesh` keeps its `<Text>` in its own `<Suspense>` and `DiceScene` renders the physics rig **outside** the cosmetic-environment `<Suspense>`, so a text/env load can never suspend away the sim that produces the result (this decoupling is what makes the roll survive even if the labels fail).

## Bundle splitting

The initial JS bundle is kept small (#432) by two levers that work together — one alone isn't enough, since a chunk is preloaded whenever the entry can reach it through a *static* import:

- **Lazy seams (dynamic `import()`)** break static reachability. `App.tsx` route-lazies the heavy non-initial pages (`SessionPage`, `CharacterCreatePage`) via `React.lazy`, and the dice seams above lazy the 3D rollers. Nothing eager imports the three.js stack.
- **`manualChunks` (in `frontend/vite.config.ts`)** isolates the vendors into two chunks: `dice-vendor` (three / @react-three / cannon-es / troika) and `react-vendor` (react, react-dom, scheduler, react-router). Both are needed: without a dedicated `react-vendor`, Rollup folds React into `dice-vendor`, and the entry's static React import then drags the whole 3D stack back into the initial preload. The Vite `preload-helper` (imported by every `React.lazy` call site) is likewise pinned to `react-vendor` for the same reason.

Net effect: `dice-vendor` (~1.1 MB) is fetched only when a roll animates or character creation loads — verify by confirming it is **not** a `modulepreload` in the built `dist/index.html`. `build.chunkSizeWarningLimit` is raised past `dice-vendor` on purpose (it never gates first paint); the warning still guards the initial `index`/`react-vendor` chunks.

## Feature-orchestrator split convention

Large interactive sections follow the orchestrator/row pattern:

```
<OrchestratorComponent character={character} onUpdate={setCharacter}>
  // owns state, batches API calls via apply*Transactions, re-renders via onUpdate
  // renders the Card and section header

  <RowComponent op-handlers-as-callbacks />
  // presentational only — no direct API calls, no local async state
  // fires callbacks up to the orchestrator
```

Examples:
- `features/inventory/`: `InventoryList` (orchestrator; also owns the derived **X/3 attunement** readout, shown when any held item is attunable) / `InventoryRow` (delegates to `InventoryEditForm`/`EquipToggle`/`AttuneToggle`/`UseConsumableButton`/`ActivateControl`/`ItemSummary`/`ItemProse`) / `AddItemPanel` / `SellPanel`. `AttuneToggle` (#546) is the attune/unattune pill, shown only for `requiresAttunement` items; it's disabled when 3 items are already attuned (`atCap`, passed down from `InventoryList`) and the server's prereq/cap rejection surfaces through the list's error line. `UseConsumableButton` (#121) is the Use affordance shown only for `category === "consumable"` rows; it plays the 3D effect-dice roll (forwarding the shown values to the server) and, for charged consumables, renders an X/Y charge indicator, disabled at 0 until a long rest recharges. `ActivateControl` (#543) is the activate/deactivate toggle for an item's `activatedEffect` capability, shown while the item is equipped/attuned; it surfaces remaining uses + the activation/duration reminder and disables at 0 uses until the matching rest recharges. `ItemSummary` renders the attunement state ("Attuned" / "Requires attunement"), a gold chip per `passiveBonus` capability (label via `capabilitySummary`), and — for an item with a charges pool (#555) — a `remaining/max charges` pill (arcane tone; parchment-outline at 0) whose `title` is the server-derived recharge text (`item.charges.recharge`). `EquipmentDoll` (#566) is the interactive paper-doll **Worn** view, reached via `InventoryList`'s Bag ⇄ Worn `Segmented` toggle: desktop armor/adornment rails + center portrait + AC crest with Main/Off hand bottom-center, and a grouped 3-column tile grid on mobile (Hands / Armor / Adornment, no doll figure). It consumes the `equip { inventoryItemId, slot }` op from #565 and batches an unequip+equip for swaps (toasting the returned item). Each of the twelve cells is an `EquipSlotCell` (RING renders two): **both** empty and filled cells open an anchored `Popover` (a consistent floating panel that never stretches the tile) — empty → a `SlotPickerPanel` of slot-compatible bag items (dismissed via the Popover's `close` render-prop); filled → a read-only summary with Unequip / Swap; a two-handed weapon locks the off-hand cell. Slot glyphs come from `EQUIP_SLOT_ICONS` (`components/ui/icons.ts`, game-icons.net via react-icons/gi, CC BY 3.0 — credited on `/about`); placement rules mirror the backend in `lib/paperDoll.ts`.
- `features/spells/`: `SpellsSection` (orchestrator) / `SpellRow` / `AddSpellPanel`

The orchestrator pattern keeps async state and API batching in one place and makes rows easy to unit-test in isolation — pass mock callbacks, assert they fire with the right args. See `testing.md` for component test patterns.

## Quick-capture palette — `features/journal/CapturePalette.tsx`

The fast in-session note surface; the sheet's own `features/character-meta/JournalSection.tsx` is now a body-only NOTE-row composer (mirroring this palette) rather than the old 3-field ENTRY form. `hooks/useGlobalKeyboard.ts` registers a document-level Cmd/Ctrl+J listener (held in a ref so it binds once); both `CharacterSheetPage` and `SessionPage` use it to open the palette. Each page also renders a visible **"＋ Note"** header button that opens the same palette (#274) — the discoverable, touch-friendly affordance; the shortcut stays as a power-user accelerator. The palette is a centered, top-anchored, wide overlay with a light scrim (the sheet peeks behind) — it reuses Modal's Esc/auto-focus/scroll-lock behavior but is its own overlay, not an inline-edit panel. The auto-focused composer commits a `NOTE` on Enter (Shift+Enter = newline) via `createJournalEntry({ kind: "NOTE", body, sessionId })`; the returned Character propagates through the page's `onUpdate`. Below the composer is a per-session NOTE feed with `loggedAt` shown as a time (`formatJournalTime`) and per-line edit/delete.

## Entity registry & @-tagging — `features/journal/` + `features/entities/` (#248)

The shared campaign wiki surface. Three pieces, all scoped to `character.campaignId`:

- **`features/journal/MentionAutocomplete.tsx`** — a **contenteditable** wrapper that drives the `@…` autocomplete and renders each stored `@[<uuid>]` token as an atomic `@Name` chip while editing (#248/#269). Public contract is unchanged: `value` (raw `@[<uuid>]` body) in, `onChange(rawBody)` out — the DOM is serialized back to tokens on every input via `lib/mentions.serializeMentionDom`, so hosts and entity backlinks are unaffected. Selecting a match or running "➕ Create <Type> …" inserts a chip; Backspace/Delete next to a chip removes it atomically and pins the caret to the chip-start body offset (via `serializeMentionDomBeforeCaret` + `placeCaretAtBodyOffset`, deferred past the value re-render) so deletion lands deterministically cross-browser (#273). Follows the WAI-ARIA combobox pattern: the `role="textbox"` editor carries `aria-controls` → the `role="listbox"` popover and `aria-activedescendant` → the active `role="option"`'s stable id (each option `id={listboxId}-opt-<index>`, driven by `activeIndex`); keyup skips the popover nav keys so arrowing doesn't reset the highlight. It intercepts Up/Down/Enter/Esc *only while the popover is open* (Enter selects a match instead of submitting; Esc `stopPropagation`s so it closes the popover, not the palette), and falls through to the composer's own `onKeyDown` otherwise. No `campaignId` → a "create or join a campaign" CTA instead of matches. Wired into `CapturePalette` (NOTE) and `JournalEntryPanel` (NOTE body). An `EXECUTED`-merged identity stays offered but is annotated with its ultimate survivor's name ("Jenkins → Vecna") via `useCampaignMerges` + `lib/merges.ultimateSurvivorName` (#387).
- **`features/journal/MentionText.tsx`** — renders a stored body with `parseMentionBody`: text verbatim, each **resolvable** `@[<uuid>]` as a Badge-styled chip linking to the entity detail page (name resolved AT RENDER, so a rename reflects instantly). An **unresolvable** id — a now-hidden entity a non-owner can't see (#379), or a deleted one — renders as a neutral 🔒 Hidden chip, never the raw token. Replaces the raw `{body}` renders in `CapturePalette`, `JournalSection`, and the `SessionSummaryModal` recap journal list.
- **`hooks/useCampaignEntities.ts`** — fetches + module-level-caches the campaign entity list once, exposing an id→entity map for chip resolution. The list is server-filtered by role, so for a non-owner the cache holds only `REVEALED` entities — which is what makes `MentionAutocomplete` offer revealed-only matches and `MentionText` redact hidden refs, without any client-side visibility logic.
- **`features/entities/EntityDetailPage.tsx`** (route `/campaigns/:id/entities/:entityId`) — name/type/aliases/notes with inline edit (any member) and, for the OWNER (gated on the campaign `role` from `fetchCampaign`), a Reveal/Hide toggle (`updateEntity({ visibility })`, primes the shared cache) and delete — every per-entity admin action reachable here (#523), plus a backlinks list (`fetchEntityBacklinks`) grouped by session. The owner sees a 🔒 Hidden badge on a hidden entity (#379). Its "back" link returns to the Manage tab when the user arrived from there (carried via `location.state.from`, or `?from=manage`), otherwise the Codex tab (#489); an origin string is only honored when it is an in-app relative path. **Identity merges (#387):** an `EXECUTED`-merged entity shows a "Revealed to be @Survivor" banner with the full chain path; a survivor lists its "Former identities" and its backlinks group by the tagged identity (via `useCampaignMerges` + `lib/merges`).
- **`features/entities/EntityList.tsx`** (#523) — the shared entity browser extracted from Codex: client-side search (`matchEntities` name+alias, normalization matching the `@`-autocomplete) composed with type-filter chips over a passed `entities` array, rows sorted by name linking to `EntityDetailPage`. The owner (`role="OWNER"`) also sees a 🔒 Hidden badge on `HIDDEN` rows. Pure browse — no create/edit; `CampaignCodex` is its sole consumer.
- **`features/entities/CampaignCodex.tsx`** (the hub's Codex tab, #367) — the campaign's **single** entity list for every role (#523): renders `EntityList` over the `useCampaignEntities` cache plus an inline expand-in-place "➕ New entity" panel (type/name/aliases/notes) that calls `createEntity` then `primeCampaignEntities` so the list, tab badge, and live journal chips update without a reload. The owner also gets a "Start hidden from players" checkbox on the create form (sends `visibility: HIDDEN`; the backend gates visibility to owners). Edit/delete/reveal-hide stay on `EntityDetailPage`.
- **`features/entities/CampaignManagePanel.tsx`** (the hub's owner-only Manage tab, #379) — since #523 the DM's **identity-merge** workflow only (the entity list + create/reveal/hide/delete moved to the Codex + `EntityDetailPage`): a "Prepare merge" form (pick old identity + true identity + note → `prepareEntityMerge`), and a merges list with Execute-reveal (confirm calls out the survivor auto-reveal, primes the entity cache) + Unmerge; writes `primeCampaignMerges`.
- **`features/entities/CampaignItemsPanel.tsx`** (the Manage tab's **second card**, below `CampaignManagePanel`, #380) — DM campaign-item authoring. A "➕ New item" form with two paths: **clone-from-catalog** (a `fetchItems` dropdown that pre-fills name/category/weight/cost/description + the matching detail block via `formFromCatalog`) and **from-scratch** with **category-conditional** detail fields — **weapon**: dice count/faces/modifier/type, versatile dice, 7 property flags (finesse/light/heavy/two-handed/reach/thrown/ammunition), rangeNormal/rangeLong, weaponClass, weaponRange; **armor**: category, base AC, dexModifierApplies, Max Dex bonus, stealth disadvantage, strength requirement; **consumable**: effect dice/modifier/description — plus a full 4-denomination cost (cp/sp/gp/pp, not gp-only) (#527). Each create (`createCampaignItem`) auto-registers a hidden ITEM entity; per-item reveal/hide toggles the fronting entity (`updateEntity({ visibility })`) and delete (`deleteCampaignItem`) removes item + entity — both `primeCampaignEntities` so the Codex stays in sync. **Edit (#505):** a per-item "Edit" affordance re-opens the *same* form pre-filled from the item (`formFromItem`, clone dropdown suppressed) and saves via `updateCampaignItem`; a rename is mirrored onto the fronting entity in the cache (`renameInCache`) and existing holders are preserved across the save. **Award/revoke (#381):** each item row also carries an "Award to \" picker (`awardCampaignItem` — grants into that member character's inventory; the panel takes `characters` from the parent campaign) and, per current holder, a "Revoke" button (`revokeCampaignItem`); awarding reveals the fronting entity locally. Holders (`{characterName, quantity}`) render inline under each item. **Capabilities & attunement (#546):** the Magic fieldset (shown only for a non-Mundane rarity) adds an **attunement prerequisite** selector (`ATTUNEMENT_PREREQ_OPTIONS`: anyone/class/spellcaster/species/alignment + a value input for the keyed kinds, gated on `requiresAttunement`) and `CapabilityEditor` — add/remove multiple `passiveBonus` capabilities, each a `{target, op, value|dice, condition, description}` row. `buildInput` sends `attunementPrereqKind/Value` (null-cleared when not applicable) and the full `capabilities[]` (REPLACE semantics server-side; `[]` clears). `formFromItem` round-trips both on Edit.
- **`features/entities/CapabilityEditor.tsx`** (#546) — the DM capability authoring sub-form used inside `CampaignItemsPanel`'s Magic fieldset (kinds: passiveBonus / castSpell / grant / **charges pool** #555; activatedEffect not yet authorable). passiveBonus rows: a **target** `Select` (`CAPABILITY_TARGET_OPTIONS`), a **key** `Select` for targets that name an ability/skill (`ABILITY_OPTIONS`/`SKILL_OPTIONS` — resolved through the helpers, never a raw key), an **op** `Select` (add/setTo), and either a scalar value or a **dice value** (count/faces/damage-type, toggled per row) for a `+2d6 fire`-style bonus. **Charges pool** rows (#555): max charges + a recharge-trigger `Select` (`CHARGE_TRIGGER_OPTIONS`: dawn/dusk/short/long) + a "Roll to regain" toggle exposing count/faces/bonus dice inputs (unchecked = refills to max); a castSpell row whose Resource is "Spends item charges" swaps its "Uses per period" input for **"Charges per cast"** (`chargeCost`). The server enforces ≤1 pool per item and that a charges-costed cast has a pool. **castSpell** rows fetch the spell catalog on demand and gate their DC/attack authoring fields on the referenced spell's `attackType`: save spells (e.g. Fireball) show **Save DC** only, attack spells (e.g. Fire Bolt) show **Attack bonus** only, utility/buff spells (e.g. Fly) show neither (and neither before a spell is picked). Picking a spell (`setSpell`) clears the inapplicable value so no stale DC/attack persists, and the "Wielder DC/attack" hint is suppressed until at least one of those fields is visible. A live `capabilitySummary` line previews each row. All display via `lib/capabilities`.
- **`features/entities/CampaignItemCard.tsx`** (#380) — the Codex item card rendered on `EntityDetailPage` for an ITEM entity (loaded via `fetchCampaignItemByEntity`): rarity/attunement/unique badges, category-specific mechanical detail, description, and (once awarded, #381) a **Held-by** holder list. `dmNotes` renders **only** when `isOwner` — and is never in a player payload to begin with (server-scrubbed).

Type display/tone resolve through `lib/mentions` (`ENTITY_TYPE_LABELS` / `ENTITY_TYPE_OPTIONS` / `ENTITY_TYPE_TONE`) — never capitalize the raw enum key.

`CampaignDetailPage` hosts the tabs as **routed** `Tabs` (#367): `/campaigns/:id` = Overview (`features/campaign/CampaignOverviewPanel.tsx` — invite/add-character/roster), `/campaigns/:id/codex` = Codex, and `/campaigns/:id/manage` = the **owner-only** Manage tab (#379 — the tab is rendered only for the owner and a non-owner deep-linking to `/manage` is redirected back to Overview once the role resolves). The active tab derives from the URL (`useMatch`) and tab clicks `navigate` (push, not replace), so deep-links, refresh, and browser back/forward all work.

## Campaign sessions — `features/session/`

Sessions are **campaign-level** (#245): one shared session per play night that party members join and leave. The `CharacterSheetPage` header button is driven by `character.campaignId` + the campaign's active session (from `fetchActiveSession`) + whether this character is an active participant: no campaign → a "Join a campaign" link to `/campaigns`; an active session this character is in → "Resume Session"; an active session it isn't in → "Join Session" (`joinSession` then navigate); no active session → "Start Session" (`startCampaignSession`). `SessionPage` adds a "Leave Session" affordance (`leaveSession`) next to "End Session" (`endSession`, campaign-scoped); leaving returns to the sheet and keeps the session open for the rest of the party (it auto-closes server-side an hour after the last member leaves). **DM quick-award (#382):** when the viewer owns the campaign (role from `fetchCampaign`), `SessionPage` shows an owner-only **Loot** tab rendering `SessionLootPanel` — pick a participant, one-click-award any campaign item (`awardCampaignItem` with the live `sessionId`); the loot event lands in the Log tab (recipient named) and the end-of-session recap's Loot line.

Client functions (all in `client.ts`): `startCampaignSession`, `joinSession`, `leaveSession`, `endSession`, `fetchCampaignSessions`, `fetchCampaignSession` are campaign-scoped; `fetchActiveSession`, `fetchSessions`, `fetchSession` stay character-scoped reads. `SessionsModal` lists the **campaign's** session history (`fetchCampaignSessions`, keyed by `campaignId`); `SessionSummaryModal` renders the campaign recap aggregate up top (XP/spells/rolls/combat + party size, items split into **acquired** vs **sold** vs **loot** (DM-awarded, #382) sections, plus slots-spent and feats/ASIs) then a per-participant card (name, time present, stat tiles, per-member items/slots/feats) for each member — **only when there's more than one participant** (a solo session shows the aggregate alone, since the single card would just duplicate it). Below that, the session's journals rendered inline via `MentionText` (@-chips resolved), and the retroactive "add XP to this session" form (which refreshes the participant summary + recap in place).
