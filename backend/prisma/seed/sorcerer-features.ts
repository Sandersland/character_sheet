// 2014 text: PHB'14. 2024 text: SRD 5.2, except Wild Magic Sorcery (not in SRD 5.2, mirror-sourced — see WILD_MAGIC_RAW).
// A renamed feature is a different name — pruneStalePartitions retires the old DB row when it disappears from the seed; never edited in place.
// Subclass display names stay "Draconic Bloodline"/"Wild Magic" — deriveResources looks them up by the persisted CharacterClassEntry.subclass string; renaming would silently strip subclass features from existing characters.
// Every Sorcerer pool is row-declared (no resourceFn left); a reintroduced resourceFn pool would shadow a same-keyed row pool in mergePoolSources.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import type { SeedEdition } from "./edition.js";
import type { ActionCostSeed, ClassFeatureSeedRow, CostKindSeed, ResourceRechargeSeed } from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`sorcerer-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawSorcererFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition?: SeedEdition;
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: ResourceRechargeSeed;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  // Metamagic's resourceKey is the action's identity ("metamagic"), not the pool it spends (costPoolKey "sorceryPoints") — actionFromRow gates on the cost pool, never this key (#1909).
  activationCost?: ActionCostSeed;
  costKind?: CostKindSeed;
  costPoolKey?: string;
  costBase?: number;
}

function expand(raw: RawSorcererFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Sorcerer",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    activationCost: raw.activationCost,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

const SORCERER_BASE_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Full-caster progression. You know a limited number of sorcerer spells (not prepared — always available).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p.139.
    description:
      "You cast spells using Charisma. Full-caster progression. You know 4 Sorcerer cantrips (5 at level 4, 6 at level 10) and prepare a growing list of Sorcerer spells — you choose which spells are prepared whenever you finish a Long Rest. An Arcane Focus serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Innate Sorcery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p.140.
    description:
      "As a Bonus Action, unleash the wellspring of magic within you: for 1 minute, you gain a +1 bonus to your spell save DC and spell attack bonus, and you have Advantage on the attack rolls of Sorcerer spells you cast. You can use this feature twice, and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "innateSorcery",
    resourceLabel: "Innate Sorcery",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 2 }],
  },
  {
    subclassSlug: null,
    name: "Font of Magic",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You have a pool of Sorcery Points equal to your sorcerer level. Spend them to create spell slots or fuel Metamagic options. Creating slots costs 2 SP (1st), 3 SP (2nd), 5 SP (3rd), 6 SP (4th), or 7 SP (5th). You can also expend a spell slot to gain SP equal to its level. Regain all SP on a long rest.",
    resourceKey: "sorceryPoints",
    resourceLabel: "Sorcery Points",
    resourceRecharge: "longRest",
    // PHB'14 p.101: Sorcery Points equal sorcerer level, from level 2.
    resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
  },
  {
    subclassSlug: null,
    name: "Font of Magic",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.140. sorceryPointCostForSlot enforces the cost/cap but not this row's minimum-Sorcerer-level clause, which stays prose only.
    description:
      "You have a pool of Sorcery Points equal to your Sorcerer level. As a Bonus Action, expend a spell slot to gain Sorcery Points equal to the slot's level, or spend Sorcery Points to create a spell slot (no action required): 2 SP for a level 1 slot (minimum Sorcerer level 2), 3 SP for level 2 (minimum level 3), 5 SP for level 3 (minimum level 5), 6 SP for level 4 (minimum level 7), 7 SP for level 5 (minimum level 9) — never above level 5. A slot created this way vanishes when you finish a Long Rest. You regain all expended Sorcery Points when you finish a Long Rest.",
    resourceKey: "sorceryPoints",
    resourceLabel: "Sorcery Points",
    resourceRecharge: "longRest",
    // SRD 5.2 p.140: Sorcery Points equal Sorcerer level, from level 2.
    resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
  },
  {
    subclassSlug: null,
    name: "Metamagic",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose 2 Metamagic options (3 at L10, 4 at L17) to twist your spells: Careful (protect allies in AoE), Distant (double range), Empowered (reroll damage dice), Extended (double duration), Heightened (impose disadvantage on target's first save), Quickened (cast as bonus action), Subtle (no verbal/somatic), or Twinned (target two creatures).",
    resourceKey: "metamagic",
    activationCost: "free",
    costKind: "pool",
    costPoolKey: "sorceryPoints",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Metamagic",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.141.
    description:
      "You gain 2 Metamagic options of your choice (2 more at level 10, 2 more at level 17), letting you twist your spells by spending Sorcery Points: Careful Spell (1 SP, protect chosen creatures from your own area spell), Distant Spell (1 SP, double range or make a touch spell reach 30 feet), Empowered Spell (1 SP, reroll damage dice up to your Charisma modifier), Extended Spell (1 SP, double a non-instantaneous duration), Heightened Spell (2 SP, Disadvantage on one target's first save against the spell), Quickened Spell (2 SP, cast an action spell as a Bonus Action), Seeking Spell (1 SP, reroll a missed spell attack roll), Subtle Spell (1 SP, cast without Verbal or Somatic components), Transmuted Spell (1 SP, change a spell's damage type to another type it can deal), or Twinned Spell (SP cost equal to the spell's level, minimum 1, target a second creature).",
    resourceKey: "metamagic",
    activationCost: "free",
    costKind: "pool",
    costPoolKey: "sorceryPoints",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Sorcerous Origin",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Your innate magic comes from a specific origin (subclass). Your origin grants you features at levels 1, 6, 14, and 18.",
  },
  {
    subclassSlug: null,
    name: "Sorcerer Subclass",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p.141.
    description:
      "Your innate magic comes from a Sorcerer Subclass of your choice, which grants you features at levels 3, 6, 14, and 18.",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Restoration",
    level: 20,
    edition: "EDITION_2014",
    description: "You regain 4 expended Sorcery Points whenever you finish a short rest.",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Restoration",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p.141. The pool tracks the once-per-Long-Rest USE limit, not the Sorcery Point amount regained.
    description:
      "When you finish a Short Rest, you can regain expended Sorcery Points, up to a number equal to half your Sorcerer level (rounded down). Once you use this feature, you must finish a Long Rest before you can use it again.",
    resourceKey: "sorcerousRestoration",
    resourceLabel: "Sorcerous Restoration",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 5, total: 1 }],
  },
  {
    subclassSlug: null,
    name: "Sorcery Incarnate",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2 p.141.
    description:
      "You can spend 2 Sorcery Points to use your Innate Sorcery even if you have no uses of it left. While your Innate Sorcery is active, you can apply two Metamagic options to a spell you cast instead of one, paying their combined Sorcery Point cost.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2 p.141. 2014's plain ASI at 19 is covered by the ASI-level table, not a ClassFeature row.
    description: "You gain an Epic Boon feat of your choice (Boon of Dimensional Travel recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Arcane Apotheosis",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2 p.141.
    description:
      "While your Innate Sorcery is active, you can apply one Metamagic option to a spell you cast without spending any Sorcery Points, once per turn.",
  },
];

// PHB'24 calls this subclass "Draconic Sorcery"; display name stays "Draconic Bloodline" (see file header).
const DRACONIC_BLOODLINE_SLUG = slug("sorcerer-draconic-bloodline");
const DRACONIC_BLOODLINE_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Ancestor",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a dragon type (black, blue, brass, bronze, copper, gold, green, red, silver, or white). You gain the ability to speak, read, and write Draconic, and have advantage on Charisma checks when interacting with dragons of that type.",
  },
  // Dragon Ancestor has no 2024 successor: PHB'24 dropped the ancestor-type concept from this subclass outright.
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Resilience",
    level: 1,
    edition: "EDITION_2014",
    description: "Your HP maximum increases by 1 per sorcerer level. While not wearing armor, your AC equals 13 + your Dexterity modifier.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Resilience",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary).
    description:
      "Your Hit Point maximum increases by 3, and it increases by 1 again whenever you gain a Sorcerer level. While you aren't wearing armor, your base Armor Class equals 10 plus your Dexterity and Charisma modifiers.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Spells",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary). Text only — SubclassGrantedSpell has no edition column, so a grant row would leak to 2014 characters; don't reintroduce a dragon-type clause (2024 has no Dragon Ancestor).
    description:
      "You always have certain spells prepared; they don't count against the number of spells you can prepare with Spellcasting: Alter Self, Chromatic Orb, Command, Dragon's Breath (level 3); Fear, Fly (level 5); Arcane Eye, Charm Monster (level 7); Legend Lore, Summon Dragon (level 9).",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Elemental Affinity",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you cast a spell that deals the damage type associated with your dragon ancestor, add your Charisma modifier to one damage roll. Also spend 1 Sorcery Point to gain resistance to that damage type for 1 hour.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Elemental Affinity",
    level: 6,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary). Damage type is an explicit choice — 2024 has no Dragon Ancestor to derive it from; don't let 2014's ancestor phrasing leak into this row.
    description:
      "Your draconic magic has an affinity with a damage type associated with dragons. Choose one of those types: Acid, Cold, Fire, Lightning, or Poison. You have Resistance to that damage type, and when you cast a spell that deals damage of that type, you can add your Charisma modifier to one damage roll of that spell.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Wings",
    level: 14,
    edition: "EDITION_2014",
    description:
      "Sprout draconic wings as a bonus action, gaining a flying speed equal to your current speed. The wings last until you dismiss them (no action required).",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Wings",
    level: 14,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary).
    description:
      "As a Bonus Action, you sprout draconic wings, which last for 1 hour or until you dismiss them (no action required); while they persist, you have a Fly Speed of 60 feet. Once you use this feature, you can't use it again until you finish a Long Rest unless you spend 3 Sorcery Points (no action required) to restore your use of it.",
    resourceKey: "dragonWings",
    resourceLabel: "Dragon Wings",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Presence",
    level: 18,
    edition: "EDITION_2014",
    description:
      "As an action, spend 5 Sorcery Points to channel draconic majesty for 1 minute (concentration). Each hostile creature within 60 ft that can see you must succeed on a Wisdom save (spell save DC) or be charmed (awed) or frightened (your choice) for the duration.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Companion",
    level: 18,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary). Text only — same SubclassGrantedSpell edition gap as Draconic Spells above.
    description:
      "You can cast Summon Dragon without expending a spell slot, a number of times equal to your Proficiency Bonus, regaining all expended uses when you finish a Long Rest. When you cast it this way, roll the die to randomly determine the dragon's type rather than choosing.",
  },
];

// Wild Magic Sorcery is NOT in SRD 5.2 — every 2024 row below is mirror-sourced, not SRD-verified (owner decision, #1232).
// PHB'24 calls this subclass "Wild Magic Sorcery"; display name stays "Wild Magic" (see file header).
const WILD_MAGIC_SLUG = slug("sorcerer-wild-magic");
const WILD_MAGIC_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Wild Magic Surge",
    level: 1,
    edition: "EDITION_2014",
    description:
      "After casting a sorcerer spell of 1st level or higher, the DM may ask you to roll a d20. On a 1, roll a d100 and consult the Wild Magic Surge table for a random magical effect.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Wild Magic Surge",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2).
    description:
      "Once per turn, you can roll 1d20 immediately after you cast a Sorcerer spell with a spell slot. If you roll a 20, roll on the Wild Magic Surge table for a random magical effect. A spell that triggers a surge this way is immune to your Metamagic.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Tides of Chaos",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Gain advantage on one attack roll, ability check, or saving throw. Once used, the DM can force a Wild Magic Surge before you can use this feature again. Alternatively, regain use after a long rest.",
    resourceKey: "tidesOfChaos",
    resourceLabel: "Tides of Chaos",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Tides of Chaos",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2). The surge roll is a consequence of the cast-to-recharge, not its trigger.
    description:
      "Before you make a D20 Test, you can gain Advantage on it. Once you do so, you must finish a Long Rest or cast a Sorcerer spell using a spell slot before you can use this feature again — doing the latter automatically triggers a roll on the Wild Magic Surge table.",
    resourceKey: "tidesOfChaos",
    resourceLabel: "Tides of Chaos",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 3, total: 1 }],
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Bend Luck",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Spend 2 Sorcery Points as a reaction to add or subtract 1d4 from an attack roll, ability check, or saving throw made by a creature you can see.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Bend Luck",
    level: 6,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2).
    description:
      "When another creature you can see makes an attack roll, an ability check, or a saving throw, you can take a Reaction and spend 1 Sorcery Point to roll 1d4 and apply it as a bonus or penalty (your choice) to that creature's roll.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Controlled Chaos",
    level: 14,
    edition: "EDITION_2014",
    description: "When rolling on the Wild Magic Surge table, roll twice and use either result.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Controlled Chaos",
    level: 14,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2).
    description: "Whenever you roll on the Wild Magic Surge table, you can roll twice and use either result.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Spell Bombardment",
    level: 18,
    edition: "EDITION_2014",
    description:
      "Once per turn when you roll damage for a spell and any die shows the highest possible result, choose one die, roll it again, and add the result to the damage.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Tamed Surge",
    level: 18,
    edition: "EDITION_2024",
    // PHB'24 p.150 (mirror-sourced; not in SRD 5.2).
    description:
      "Once per Long Rest, whenever you roll on the Wild Magic Surge table, you can replace the triggered effect with a Wild Magic Surge effect of your choice from the table, other than its final effect.",
    resourceKey: "tamedSurge",
    resourceLabel: "Tamed Surge",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 18, total: 1 }],
  },
];

export const SORCERER_FEATURES: ClassFeatureSeedRow[] = [...SORCERER_BASE_RAW, ...DRACONIC_BLOODLINE_RAW, ...WILD_MAGIC_RAW].flatMap(expand);
