import type { RulesEdition } from "@character-sheet/shared-types";

// Plain-language copy for the two supported rules editions (#1286) — players
// say "2024 rules" or "the new books", never "SRD 5.2" (the actual citation
// name lives only in backend rule comments, never in UI text).
export const RULES_EDITIONS: readonly RulesEdition[] = ["EDITION_2024", "EDITION_2014"];

// Deliberate-coupling latch: byte-identical to backend/src/lib/rules/edition.ts's
// RULES_EDITION_LABELS (the join-mismatch error text is asserted against this
// copy — see CampaignDetailPage.test.tsx's "surfaces the edition-mismatch error
// verbatim" test). Not single-sourced in @character-sheet/shared-types because
// that package is pure types only (index.ts: "nothing here reaches either
// runtime bundle") — a runtime const there would break that invariant for every
// consumer. Change one, change both.
export const EDITION_LABELS: Record<RulesEdition, string> = {
  EDITION_2024: "2024 rules",
  EDITION_2014: "2014 rules",
};

export const EDITION_DESCRIPTIONS: Record<RulesEdition, string> = {
  EDITION_2024: "The current rulebooks — what most new tables are running.",
  EDITION_2014: "The original 5th edition rulebooks, sometimes called \"classic\" 5e.",
};

// Deliberate-coupling latch (#1371): an edition present here renders as a
// visible-but-unselectable EditionPicker card carrying this reason. Remove the
// EDITION_2014 entry only when #1372 (its content parity ungate) ships — that
// issue also restores the tests this map's addition inverted.
export const EDITION_UNAVAILABLE: Partial<Record<RulesEdition, string>> = {
  EDITION_2014:
    "Not available yet — the 2014 feats, fighting styles, caster model and Monk rules haven't shipped, and a character's edition can't be changed later.",
};
