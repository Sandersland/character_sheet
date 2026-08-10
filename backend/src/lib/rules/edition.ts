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
 * stays one function per rule, shaped as a total mapping over `edition` — a
 * `switch` with an `assertNever`-typed `default`, or a `Record<RulesEdition,
 * …>` — never `if (edition === …) … else …`, which lets an unrecognized
 * edition silently fall into whichever branch is the `else` (#1527).
 * `subclassGateLevel` is the pattern-setter. A reconciler and its clamp-on-read
 * must always resolve to the same one. A rule that is edition-invariant — the
 * majority — takes no `edition` and changes nothing.
 *
 * Pure, zero-project-import modules (`effectiveEntryLevel`, `subclassGateLevel`)
 * import `RulesEdition` straight from `@character-sheet/shared-types` to stay
 * cycle-safe; everything else goes through `editionOf` here.
 */
export function editionOf(row: { rulesEdition: RulesEdition }): RulesEdition {
  return row.rulesEdition;
}

// The exhaustive validity set (#1527) — every `RulesEdition` union member,
// derived so a member added to the type without a matching entry HERE is a
// `tsc` error against the `satisfies Record<RulesEdition, true>` below,
// rather than an array someone forgot to extend. This is the SOURCE OF TRUTH
// for "is this a real edition"; RULES_EDITION_DISPLAY_ORDER is a presentation
// ordering OVER this set (asserted a permutation of it in edition.test.ts),
// never a second copy of it. Object.keys widens to `string[]` at the type
// level, but RulesEdition's members are exactly EDITION_PRESENCE's keys by
// construction, so the cast back to `RulesEdition[]` is sound.
const EDITION_PRESENCE = { EDITION_2014: true, EDITION_2024: true } satisfies Record<RulesEdition, true>;
export const ALL_RULES_EDITIONS: readonly RulesEdition[] = Object.keys(EDITION_PRESENCE) as RulesEdition[];

// A presentation ordering OVER ALL_RULES_EDITIONS (#1527) — NOT the validity
// set (isRulesEdition below membership-tests ALL_RULES_EDITIONS instead), so
// reordering or shortening this array for a display decision can never make a
// real edition unrecognized. Its order IS the order editionsRouter serves and
// EditionPicker renders — 2024 first, because that is what most new tables
// run. Until #1436 there was a second array of the same name in the frontend
// in the OPPOSITE order, while two client sites treated index 0 as the
// creation default; "aligning the two arrays" would silently have flipped the
// edition of every new campaign and solo character. Never index this array to
// obtain a default — that is DEFAULT_RULES_EDITION's job, and the two are
// independent concerns that merely agree today (a product decision to show
// 2014 first must not move the creation default).
export const RULES_EDITION_DISPLAY_ORDER: readonly RulesEdition[] = ["EDITION_2024", "EDITION_2014"];

// The one guard for an edition arriving over the wire (a query param, a body
// field) rather than read off a Character row — feats.ts and reference.ts both
// need this, so it lives here rather than being copy-pasted a third time. It
// only membership-tests ALL_RULES_EDITIONS (#1527), so display order is
// irrelevant to it and there is no second array to fall out of sync with.
export function isRulesEdition(raw: unknown): raw is RulesEdition {
  return (ALL_RULES_EDITIONS as readonly string[]).includes(raw as string);
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

