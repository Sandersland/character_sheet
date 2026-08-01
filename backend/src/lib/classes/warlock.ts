import type { ClassDefinition, DerivedResource } from "./types.js";

// #1233 commit 1: Warlock's feature TEXT moved to literal seed data
// (prisma/seed/warlock-features.ts) — see that file's own header for the
// three-commit arc. Unlike fighter.ts/barbarian.ts (both deleted outright by
// their own retabs), this module is NOT deletable: each patron's PHB'14
// subclass grant level is 1, not the 3 every SUBCLASS_IDENTITY-seeded,
// not-yet-deleted module falls back to (subclassGateLevel(undefined,
// "EDITION_2014") === 3) — see the PHB'14 p.105 citation below. #1576 tracks
// moving this gate onto data so this module can finally go. Commit 3 will
// also keep a small Fiend-only resourceFn residue here for a Charisma-
// modifier-formula pool resourceTotals' tier table can't express.
export const warlock: ClassDefinition = {
  // PHB'14 p.105: Otherworldly Patron (Warlock's subclass) is chosen at 1st level.
  subclasses: {
    "the fiend": {
      slug: "warlock-the-fiend",
      grantLevel: 1,
      resourceFn: (level) => {
        if (level < 6) return [];
        const pools: DerivedResource[] = [
          {
            key: "darkOnesOwnLuck",
            label: "Dark One's Own Luck",
            total: 1,
            recharge: "short-or-long",
            description: "Add 1d10 to one ability check or saving throw. Regain use on a short or long rest.",
          },
        ];
        if (level >= 14) {
          pools.push({
            key: "hurlThroughHell",
            label: "Hurl Through Hell",
            total: 1,
            recharge: "longRest",
            description: "When you hit a creature, banish it through the Lower Planes until the start of your next turn (10d10 psychic damage). Regain use on a long rest.",
          });
        }
        return pools;
      },
    },
    "the archfey": {
      slug: "warlock-the-archfey",
      grantLevel: 1,
      resourceFn: (level) => {
        const pools: DerivedResource[] = [
          {
            key: "feyPresence",
            label: "Fey Presence",
            total: 1,
            recharge: "short-or-long",
            description: "Action: charm or frighten creatures in a 10-ft cube (Wisdom save). Regain use on a short or long rest.",
          },
        ];
        if (level >= 6) {
          pools.push({
            key: "mistyEscape",
            label: "Misty Escape",
            total: 1,
            recharge: "short-or-long",
            description: "Reaction when damaged: turn invisible and teleport up to 60 ft. Lasts until start of next turn. Regain use on a short or long rest.",
          });
        }
        if (level >= 14) {
          pools.push({
            key: "darkDelirium",
            label: "Dark Delirium",
            total: 1,
            recharge: "short-or-long",
            description: "Action: plunge a creature into an illusory dreamscape (Wisdom save). Charmed or frightened and incapacitated. Regain use on a short or long rest.",
          });
        }
        return pools;
      },
    },
    "the great old one": {
      slug: "warlock-the-great-old-one",
      grantLevel: 1,
      resourceFn: (level) => {
        if (level < 6) return [];
        return [
          {
            key: "entropicWard",
            label: "Entropic Ward",
            total: 1,
            recharge: "short-or-long",
            description: "Reaction: impose disadvantage on one attack against you. If it misses, you have advantage on your next attack against it. Regain use on a short or long rest.",
          },
        ];
      },
    },
  },
};
