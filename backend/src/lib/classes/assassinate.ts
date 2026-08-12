// Assassinate (Rogue subclass: Assassin, L3) — PHB'14 p.97: "You have
// advantage on attack rolls against any creature that hasn't taken a turn
// yet this combat. Any hit you score against a creature that is surprised is
// a critical hit." SRD 5.2 / PHB'24's Assassin rework (#1231,
// prisma/seed/rogue-features.ts's own EDITION_2024 "Assassinate" row)
// explicitly DELETES the auto-crit clause, replacing it with Rogue-level
// extra Sneak Attack damage on a round-1 hit — so this rule is 2014-only
// CONTENT with no 2024 counterpart to edition-parameterize. `edition` still
// gates it (last param, per editionOf's documented convention) because
// existence itself is what differs here, not just the math (contrast
// Stunning Strike, edition-invariant in existence, edition-parameterized
// only in its outcome text).
//
// The advantage-vs-hasn't-acted-yet clause stays reminder text (no
// initiative-order awareness at the attack card, #1526 scope) — this module
// only covers the hit-to-crit half.
//
// resolveSubclassSlug (#1277) is the ONE place a character resolves onto the
// SUBCLASS_SLUGS vocabulary — never a `subclass === "Assassin"` name literal
// (that substring-match bug class is #1339).

import type { RulesEdition } from "@character-sheet/shared-types";

import { resolveSubclassSlug, type SubclassIdentityInput } from "./subclass-slug.js";

export const ASSASSINATE_LEVEL = 3;

type AssassinateClassEntry = SubclassIdentityInput & { name: string; level: number };

/**
 * True when `classEntries` holds a 2014 Assassin at rogue level 3+ — the
 * single shared rule function both `character-serialize.ts`'s
 * `assassinateRider` (what the attack card shows) and
 * `resolve-action.ts`'s op validation (what the server accepts as a
 * legitimate Assassinate declaration) call, so the two can never drift onto
 * separate gates (CLAUDE.md's level-gated-state rule: one shared function,
 * never two inline copies).
 */
export function assassinateEligible(classEntries: AssassinateClassEntry[], edition: RulesEdition): boolean {
  if (edition !== "EDITION_2014") return false;
  const rogue = classEntries.find((c) => c.name.toLowerCase() === "rogue");
  if (!rogue) return false;
  return resolveSubclassSlug("rogue", rogue) === "rogue-assassin" && rogue.level >= ASSASSINATE_LEVEL;
}
