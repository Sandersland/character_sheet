export type { RulesEdition } from "@character-sheet/shared-types";

import type { RulesEdition } from "@character-sheet/shared-types";

/**
 * The one documented way for rules code to learn a character's edition (#1285).
 *
 * The authority is always the *character's* `rulesEdition`, never the
 * campaign's — a campaign's edition is only the default a new character is
 * created with, and a character may be in several campaigns or none (#1080).
 *
 * The parameter is required rather than optional on purpose: a Prisma `select`
 * that forgot `rulesEdition: true` is then a compile error instead of a silent
 * 2024 default.
 *
 * A rule that differs by edition takes `edition` as its **last** parameter and
 * stays one function per rule (branching inside, or dispatching to per-edition
 * helpers) — `subclassGateLevel` is the pattern-setter. A reconciler and its
 * clamp-on-read must always resolve to the same one. A rule that is
 * edition-invariant — the majority — takes no `edition` and changes nothing.
 *
 * Pure, zero-project-import modules (`effectiveEntryLevel`, `subclassGateLevel`)
 * import `RulesEdition` straight from `@character-sheet/shared-types` to stay
 * cycle-safe; everything else goes through `editionOf` here.
 */
export function editionOf(row: { rulesEdition: RulesEdition }): RulesEdition {
  return row.rulesEdition;
}

// The ONE RulesEdition order array in the codebase, and its order IS the order
// editionsRouter serves and EditionPicker renders — 2024 first, because that is
// what most new tables run. Until #1436 there was a second array of the same
// name in the frontend in the OPPOSITE order, while two client sites treated
// index 0 as the creation default; "aligning the two arrays" would silently have
// flipped the edition of every new campaign and solo character. Never index this
// array to obtain a default — that is DEFAULT_RULES_EDITION's job, and the two
// are independent concerns that merely agree today (a product decision to show
// 2014 first must not move the creation default).
export const RULES_EDITION_DISPLAY_ORDER: readonly RulesEdition[] = ["EDITION_2024", "EDITION_2014"];

// The one guard for an edition arriving over the wire (a query param, a body
// field) rather than read off a Character row — feats.ts and reference.ts both
// need this, so it lives here rather than being copy-pasted a third time. It
// only membership-tests the array above, so display order is irrelevant to it
// and there is no second array to fall out of sync with.
export function isRulesEdition(raw: unknown): raw is RulesEdition {
  return (RULES_EDITION_DISPLAY_ORDER as readonly string[]).includes(raw as string);
}

// Mirrors Character.rulesEdition's Prisma `@default(EDITION_2024)` — the ONE
// place validation code names that default explicitly, for the rare case where
// a decision (e.g. character-create.ts's creation-time subclass gate check)
// must resolve an edition before the row exists to read `rulesEdition` from.
// Deliberate-coupling latch: change the schema default, change this too.
export const DEFAULT_RULES_EDITION: RulesEdition = "EDITION_2024";

// Plain-language labels for user-facing text — players say "2014/2024 rules",
// never "SRD 5.1/5.2" (#1286). Sole source since #1436 deleted the frontend
// twin: every label the client renders is served, either by editionsRouter or
// alongside a `rulesEdition` key as `rulesEditionLabel`. The campaign-join
// mismatch message is composed entirely in campaignsRouter's attach handler from
// this map, so no client copy could ever affect its wording.
export const RULES_EDITION_LABELS: Record<RulesEdition, string> = {
  EDITION_2014: "2014 rules",
  EDITION_2024: "2024 rules",
};

// Prose for the edition picker's cards — product copy, not rules text, so it
// names no SRD citation.
export const EDITION_DESCRIPTIONS: Record<RulesEdition, string> = {
  EDITION_2024: "The current rulebooks — what most new tables are running.",
  EDITION_2014: "The original 5th edition rulebooks, sometimes called \"classic\" 5e.",
};

// Deliberate-coupling latch (#1371): an edition present here is served with an
// `unavailableReason` and renders as a visible-but-unselectable EditionPicker
// card carrying that reason. Remove the EDITION_2014 entry only when #1372 (its
// content-parity ungate) ships — the entry lives HERE since #1436, not in any
// frontend module, and that issue also restores the tests this map's addition
// inverted.
// #1506: "Monk rules" dropped from the reason string — the 2014 Monk (epic
// #1313) shipped in full (#1499-#1505 + this slice's e2e), so the gate no
// longer names it as an unshipped blocker. #1372 (feats/fighting styles/
// caster model, #1310/#1311/#1312) is the remaining gate — #1372 owns
// deleting this entry entirely once THOSE ship too.
export const EDITION_UNAVAILABLE: Partial<Record<RulesEdition, string>> = {
  EDITION_2014:
    "Not available yet — the 2014 feats, fighting styles, and caster model haven't shipped, and a character's edition can't be changed later.",
};
