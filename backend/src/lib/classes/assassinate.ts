// PHB'14 p.97 — 2014-only content; SRD 5.2/PHB'24 deletes the auto-crit clause entirely (no 2024 counterpart).
// The advantage-vs-hasn't-acted-yet clause stays reminder text (no initiative-order awareness, #1526 scope) — this module only covers the hit-to-crit half.
// resolveSubclassSlug is the only place a character resolves onto SUBCLASS_SLUGS — never a `subclass === "Assassin"` literal (#1339).

import type { RulesEdition } from "@character-sheet/shared-types";

import { resolveSubclassSlug, type SubclassIdentityInput } from "./subclass-slug.js";

export const ASSASSINATE_LEVEL = 3;

type AssassinateClassEntry = SubclassIdentityInput & { name: string; level: number };

// SRD 5.2 has no Assassin subclass; PHB'24's Assassinate drops the auto-crit this module models — no 2024 counterpart here.
function editionHasAssassinate(edition: RulesEdition): boolean {
  switch (edition) {
    case "EDITION_2014":
      return true;
    case "EDITION_2024":
      return false;
    default: {
      const exhaustive: never = edition;
      throw new Error(`editionHasAssassinate: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Single shared gate used by both assassinateRider and assertAssassinateEligible — must never drift into two inline copies (CLAUDE.md one-shared-function rule).
export function assassinateEligible(classEntries: AssassinateClassEntry[], edition: RulesEdition): boolean {
  if (!editionHasAssassinate(edition)) return false;
  const rogue = classEntries.find((c) => c.name.toLowerCase() === "rogue");
  if (!rogue) return false;
  return resolveSubclassSlug("rogue", rogue) === "rogue-assassin" && rogue.level >= ASSASSINATE_LEVEL;
}
