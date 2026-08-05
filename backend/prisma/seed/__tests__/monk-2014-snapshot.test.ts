// #1500: the 2014 Monk base-class rows are now a real SRD 5.1 / PHB'14
// rewrite (17 rows), no longer a byte-identical transcription of the 2024
// text (#1675's transport-only state, pinned by this file's pre-#1500
// version). This snapshot pins the CURRENT authored text so a future edit
// can't silently drift it — same shape as every other class's own
// "-2014-snapshot" oracle, just re-pointed at real content instead of a
// byte-identity proof. Subclass rows are untouched by this slice (no 2014
// monk subclass slug exists yet, #1501-#1503) and stay covered by
// monk-2024-content.test.ts's per-partition counts instead.
import { describe, expect, it } from "vitest";

import { MONK_FEATURES } from "../monk-features.js";

interface Pinned {
  name: string;
  level: number;
  description: string;
}

const PINNED_2014_BASE: Pinned[] = [
  {
    name: "Unarmored Defense",
    level: 1,
    description:
      "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  },
  {
    name: "Martial Arts",
    level: 1,
    description:
      "With unarmed strikes or monk weapons (shortsword and any simple melee weapon without the two-handed or heavy property): use Dexterity instead of Strength for attack and damage rolls; deal 1d4 (L1–4), 1d6 (L5–10), 1d8 (L11–16), or 1d10 (L17+) damage; immediately after you take the Attack action on your turn, make one unarmed strike as a bonus action.",
  },
  {
    name: "Ki",
    level: 2,
    description:
      "You have a pool of Ki Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 ki — immediately after taking the Attack action, make two unarmed strikes as a bonus action), Patient Defense (1 ki — take the Dodge action as a bonus action), Step of the Wind (1 ki — take the Disengage or Dash action as a bonus action, jump distance doubled for the turn). Ki save DC = 8 + proficiency + Wisdom modifier. Regain all ki on a short or long rest.",
  },
  {
    name: "Unarmored Movement",
    level: 2,
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    name: "Deflect Missiles",
    level: 3,
    description:
      "Use your reaction to reduce damage from a ranged weapon attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0 and the missile is small enough to hold in one hand with a hand free, you catch it. You can then spend 1 ki to make a ranged attack with it as part of the same reaction — range 20/60 ft, always made with proficiency — dealing 1d6 + Dexterity modifier bludgeoning damage to one creature within range on a hit.",
  },
  {
    name: "Slow Fall",
    level: 4,
    description: "Use your reaction to reduce falling damage by 5 × your monk level.",
  },
  {
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    name: "Stunning Strike",
    level: 5,
    description:
      "When you hit another creature with a melee weapon attack, you can spend 1 ki point to attempt a stunning strike. The target must succeed on a Constitution save (ki save DC) or be stunned until the end of your next turn. Unlike Flurry of Blows, this can be attempted more than once per turn as long as you have ki points to spend.",
  },
  {
    name: "Ki-Empowered Strikes",
    level: 6,
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.",
  },
  {
    name: "Evasion",
    level: 7,
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    name: "Stillness of Mind",
    level: 7,
    description: "Use your action to end one effect on yourself that is causing you to be charmed or frightened.",
  },
  {
    name: "Purity of Body",
    level: 10,
    description: "You are immune to disease and poison.",
  },
  {
    name: "Tongue of the Sun and Moon",
    level: 13,
    description:
      "You understand all spoken languages, and any creature that can understand a language understands what you say.",
  },
  {
    name: "Diamond Soul",
    level: 14,
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 ki point to reroll it and take the second result.",
  },
  {
    name: "Timeless Body",
    level: 15,
    description:
      "Your ki sustains you so that you suffer none of the frailty of old age, and you can't be aged magically (though you can still die of old age). You no longer need food or water.",
  },
  {
    name: "Empty Body",
    level: 18,
    description:
      "Use your action to spend 4 ki points to become invisible for 1 minute; during that time you also have resistance to all damage but force damage. Additionally, you can spend 8 ki points to cast astral projection without expending a material component; when you do, you can't take any other creatures with you.",
  },
  {
    name: "Perfect Self",
    level: 20,
    description: "When you roll initiative and have no ki points remaining, you regain 4 ki points.",
  },
];

function byName(rows: typeof MONK_FEATURES, name: string) {
  const found = rows.filter((r) => r.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
}

describe("2014 Monk base class — real SRD 5.1 / PHB'14 content (#1500)", () => {
  const base2014 = MONK_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2014");

  it("has exactly the 17 pinned features, each at the pinned level with the pinned text", () => {
    expect(base2014).toHaveLength(PINNED_2014_BASE.length);
    for (const pinned of PINNED_2014_BASE) {
      const actual = byName(base2014, pinned.name);
      expect(actual.level, pinned.name).toBe(pinned.level);
      expect(actual.description, pinned.name).toBe(pinned.description);
    }
  });

  it("no extra EDITION_2014 base row exists beyond the 17 pinned above", () => {
    expect(new Set(base2014.map((r) => r.name))).toEqual(new Set(PINNED_2014_BASE.map((p) => p.name)));
  });

  // Five 2024-only names (no 2014 row at all) and six 2014-only names (no
  // 2024 row at all) — the concrete list behind the 17-vs-18 count split.
  it("2024-only base features have no EDITION_2014 row", () => {
    const names2014 = new Set(base2014.map((r) => r.name));
    for (const name of ["Uncanny Metabolism", "Heightened Focus", "Self-Restoration", "Perfect Focus", "Superior Defense"]) {
      expect(names2014.has(name), name).toBe(false);
    }
  });

  it("2014-only base features have no EDITION_2024 row", () => {
    const base2024 = MONK_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2024");
    const names2024 = new Set(base2024.map((r) => r.name));
    for (const name of ["Stillness of Mind", "Purity of Body", "Tongue of the Sun and Moon", "Timeless Body", "Empty Body", "Perfect Self"]) {
      expect(names2024.has(name), name).toBe(false);
    }
  });

  // Same-level, different-name pairs — the "one description can't cite two
  // documents" fork (#1430 precedent) for mechanics the editions otherwise agree on.
  it("forked same-level pairs carry DIFFERENT text between editions", () => {
    const base2024 = MONK_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2024");
    const pairs: Array<[string, string]> = [
      ["Martial Arts", "Martial Arts"],
      ["Ki", "Focus"],
      ["Deflect Missiles", "Deflect Attacks"],
      ["Stunning Strike", "Stunning Strike"],
      ["Ki-Empowered Strikes", "Empowered Strikes"],
      ["Diamond Soul", "Disciplined Survivor"],
    ];
    for (const [name2014, name2024] of pairs) {
      const row2014 = byName(base2014, name2014);
      const row2024 = byName(base2024, name2024);
      expect(row2014.level, `${name2014}/${name2024}`).toBe(row2024.level);
      expect(row2014.description).not.toBe(row2024.description);
    }
  });

  // Genuinely invariant rows (SRD 5.1 and SRD 5.2 agree word-for-word) stay
  // byte-identical across editions — the "Do NOT fork" half of #1313's table.
  it("edition-invariant rows are byte-identical across editions", () => {
    const base2024 = MONK_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2024");
    for (const name of ["Unarmored Defense", "Unarmored Movement", "Slow Fall", "Extra Attack", "Evasion"]) {
      const row2014 = byName(base2014, name);
      const row2024 = byName(base2024, name);
      expect(row2014.description).toBe(row2024.description);
      expect(row2014.level).toBe(row2024.level);
    }
  });
});
