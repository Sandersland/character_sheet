import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedResource } from "./types.js";

// #1229: Paladin's feature TEXT moved to literal seed data
// (prisma/seed/paladin-features.ts, commits 1-2) and the Channel Divinity
// resource pool moved onto its two carrier rows (commit 3, this one — see
// that file's own RESOURCE POOL header block). This module is a FOURTH end
// state (class-features.ts:56-75 enumerates the other three): unlike
// Fighter/Barbarian/Rogue (deleted outright) it isn't kept alive by a
// non-3 subclass `grantLevel` (Paladin's oaths already grant at 3, matching
// subclassGateLevel's fallback — Warlock/Wizard/Sorcerer/Cleric's own
// reason), and unlike Ranger it isn't the `choices` catalog. It survives
// purely because TWO of its THREE pools are formula-shaped, not tier tables:
// `divineSense`'s total is `1 + Charisma modifier` — an ADDITIVE offset, not
// the `Math.max(min, mod)` floor #1685's `{ abilityMod, min }` evaluates, so
// it stays out of scope for that vocabulary (and is gated off entirely for a
// 2024 Paladin — 2024 removed Divine Sense as its own pool, see the #1499
// edition fork below) — and `layOnHands`'s total IS the #1685 `{ levelTimes:
// 5 }` shape, but its own description states the formula IN WORDS ("a pool of
// 5 × your paladin level" / "a pool equal to five times your Paladin level"),
// while this resourceFn's description below states the COMPUTED NUMBER
// (`Pool of ${level * 5} healing HP`) — migrating would swap what a player
// actually reads (a formula) for what they read today (a live number),
// failing #1685's byte-identical AC outright, so Lay on Hands stays
// EXCLUDED rather than migrated as the issue's named stretch goal.
// `channelDivinity`'s pool, a flat/tiered total with no computed value, is
// the one that moved onto its rows — see paladin-features.ts's own RESOURCE
// POOL header block for why exactly one row per edition carries it.
export const paladin: ClassDefinition = {
  // subclassKey is unused here — the base pool never needs to resolve a
  // subclass-specific variant — but the full parameter list is declared so
  // `edition` can gate `divineSense` off for 2024 (#1499; see ResourceFn's
  // header for why a shorter list would also typecheck for every other
  // class's resourceFn, and monk.ts's own resourceFn for the pattern this
  // copies).
  resourceFn: (level, abilityScores, _profBonus, _subclassKey, edition: RulesEdition) => {
    const chaMod = abilityModifier(abilityScores.charisma ?? 10);
    const pools: DerivedResource[] = [];
    // 2024 removed Divine Sense as its own resource pool — its job moves to
    // the Channel Divinity option "Channel Divinity: Divine Sense"
    // (paladin-features.ts, base class, L3), which spends the channelDivinity
    // pool instead of its own charges. A 2014 Paladin still plays the L1
    // Divine Sense pool exactly as before.
    if (edition === "EDITION_2014") {
      pools.push({
        key: "divineSense",
        label: "Divine Sense",
        total: Math.max(1, 1 + chaMod),
        recharge: "longRest",
        description: "Action: sense celestials, fiends, and undead within 60 ft until end of next turn. Regain all uses on a long rest.",
      });
    }
    // layOnHands stays unconditional in both editions, but its 2024
    // description drops the cure-disease/neutralize-poison sentence (SRD 5.2
    // cuts disease as a mechanic outright; the Poisoned-condition removal
    // moves into Restoring Touch, a separate feature, not this pool's own
    // description) — forked inside this ONE function on `edition`, never a
    // second function (CLAUDE.md).
    pools.push({
      key: "layOnHands",
      label: "Lay on Hands",
      total: level * 5,
      recharge: "longRest",
      description:
        edition === "EDITION_2014"
          ? `Pool of ${level * 5} healing HP. Touch to restore HP; spend 5 HP to cure a disease or neutralize a poison. Replenishes on a long rest.`
          : `Pool of ${level * 5} healing HP. Touch to restore HP; spend 5 HP to remove the Poisoned condition instead of healing. Replenishes on a long rest.`,
    });
    // channelDivinity is NOT declared here — it moved onto paladin-features.ts's
    // two "Channel Divinity" rows (one per edition, #1229 commit 3). Declaring
    // it here too would be silently "max"-merged with the row's pool by
    // registry.ts's SHARED_POOL_MERGE instead of erroring (see that file's own
    // RESOURCE POOL header block).
    return pools;
  },
  subclasses: {
    "oath of devotion": { slug: "paladin-oath-of-devotion", grantLevel: 3 },
    "oath of the ancients": { slug: "paladin-oath-of-the-ancients", grantLevel: 3 },
    "oath of vengeance": { slug: "paladin-oath-of-vengeance", grantLevel: 3 },
  },
};
