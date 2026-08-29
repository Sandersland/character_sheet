export type { RulesEdition } from "@character-sheet/shared-types";

import type { RulesEdition } from "@character-sheet/shared-types";

// Character.rulesEdition is the only authority — never Campaign.rulesEdition, which is only the default a new character is created with.
// edition is a required parameter, not optional, so a Prisma select missing rulesEdition is a compile error, not a silent 2024 default.
// effectiveEntryLevel and subclassGateLevel import RulesEdition straight from shared-types to stay cycle-safe; everything else goes through editionOf.
export function editionOf(row: { rulesEdition: RulesEdition }): RulesEdition {
  return row.rulesEdition;
}

// A member added to RulesEdition without a matching key here is a tsc error against `satisfies Record<RulesEdition, true>`, not a silently-stale array.
// Object.keys widens to string[], but RulesEdition's members are exactly EDITION_PRESENCE's keys by construction, so the cast back to RulesEdition[] is sound.
const EDITION_PRESENCE = { EDITION_2014: true, EDITION_2024: true } satisfies Record<RulesEdition, true>;
export const ALL_RULES_EDITIONS: readonly RulesEdition[] = Object.keys(EDITION_PRESENCE) as RulesEdition[];

// NOT the validity set — isRulesEdition membership-tests ALL_RULES_EDITIONS instead, so reordering or shortening this can never make a real edition unrecognized.
// Never index this array to obtain a default — that's DEFAULT_RULES_EDITION's job; the two are independent and merely agree today.
export const RULES_EDITION_DISPLAY_ORDER: readonly RulesEdition[] = ["EDITION_2024", "EDITION_2014"];

// Guards an edition value arriving over the wire; membership-tests ALL_RULES_EDITIONS only, so display order can't desync from validity.
export function isRulesEdition(raw: unknown): raw is RulesEdition {
  return (ALL_RULES_EDITIONS as readonly string[]).includes(raw as string);
}

// Mirrors Character.rulesEdition's Prisma @default(EDITION_2024) — change the schema default, change this too.
export const DEFAULT_RULES_EDITION: RulesEdition = "EDITION_2024";

// Players say "2014/2024 rules", never "SRD 5.1/5.2" — this is the sole source; campaignsRouter's edition-mismatch message is composed entirely from this map.
export const RULES_EDITION_LABELS: Record<RulesEdition, string> = {
  EDITION_2014: "2014 rules",
  EDITION_2024: "2024 rules",
};

// Product copy, not rules text, so it names no SRD citation.
export const EDITION_DESCRIPTIONS: Record<RulesEdition, string> = {
  EDITION_2024: "The current rulebooks — what most new tables are running.",
  EDITION_2014: "The original 5th edition rulebooks, sometimes called \"classic\" 5e.",
};

