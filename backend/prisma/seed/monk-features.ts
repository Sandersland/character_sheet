// DATA MODULE ONLY (#1277 AC 4): no direct database calls or async writes.
//
// Way of the Open Hand: SRD 5.1 p.78 / PHB'14 p.78.
// Way of Shadow: PHB'14 pp.79-80, not in SRD 5.1.
// Way of the Four Elements: PHB'14 pp.78, 80-81, not in SRD 5.1.
// Warrior of Mercy rows stay untagged/shared (PHB'24 p.92, not in SRD 5.2) — retagging is #1972.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { ChoiceCountTier, EffectBuffRow, InitiativeRegenRow, ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import type { SeedEdition } from "./edition.js";
import type {
  ActionCostSeed,
  ClassFeatureSeedRow,
  CostKindSeed,
  DerivedStatSeed,
  ResolverKindSeed,
  ResourceRechargeSeed,
} from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`monk-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawMonkFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition?: SeedEdition;
  derivedStat?: DerivedStatSeed;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // fallow-ignore-next-line code-duplication -- mirrors fighter-features.ts's Raw*Feature shape by convention, not a shared base type
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: ResourceRechargeSeed;
  // fallow-ignore-next-line code-duplication -- same per-class-file mirror as above
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula }[];
  resourceOnInitiative?: InitiativeRegenRow[];
  choiceKey?: string;
  choiceLabel?: string;
  choiceCatalogSource?: string;
  choiceCountTiers?: ChoiceCountTier[];
  activationCost?: ActionCostSeed;
  resolverKind?: ResolverKindSeed;
  costKind?: CostKindSeed;
  costPoolKey?: string;
  costBase?: number;
  effectBuffs?: EffectBuffRow[];
  regrants?: string[];
  requiresUnarmored?: boolean;
  reminder?: string;
  count?: number;
  actionOnly?: boolean;
}

function expand(raw: RawMonkFeature): ClassFeatureSeedRow[] {
  // fallow-ignore-next-line code-duplication -- mirrors barbarian-features.ts's expand()/RAW shape by convention, not a shared base type
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Monk",
    // fallow-ignore-next-line code-duplication -- mirrors fighter-features.ts's expand() by convention, not a shared helper
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    resourceOnInitiative: raw.resourceOnInitiative,
    choiceKey: raw.choiceKey,
    choiceLabel: raw.choiceLabel,
    choiceCatalogSource: raw.choiceCatalogSource,
    choiceCountTiers: raw.choiceCountTiers,
    activationCost: raw.activationCost,
    resolverKind: raw.resolverKind,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
    effectBuffs: raw.effectBuffs,
    regrants: raw.regrants,
    requiresUnarmored: raw.requiresUnarmored,
    reminder: raw.reminder,
    count: raw.count,
    actionOnly: raw.actionOnly,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// Base class — SRD 5.1 pp.46-49 / PHB'14 pp.76-79 (2014); SRD 5.2 pp.87-89 /
// PHB'24 pp.87-89 (2024). 17 EDITION_2014 rows + 18 EDITION_2024 rows —
// exact counts pinned by monk-2024-content.test.ts.
const MONK_BASE_RAW: RawMonkFeature[] = [
  {
    subclassSlug: null,
    name: "Unarmored Defense",
    level: 1,
    description:
      "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  },
  {
    subclassSlug: null,
    name: "Unarmored Movement",
    level: 2,
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    subclassSlug: null,
    name: "Slow Fall",
    level: 4,
    description: "Use your reaction to reduce falling damage by 5 × your monk level.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // SRD 5.1 / SRD 5.2 Monk: flat tier, no scaling beyond L5.
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Evasion",
    level: 7,
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },

  // SRD 5.1 p.46 requires the Attack action first for the bonus strike; SRD 5.2 p.87 does not (#1430).
  {
    subclassSlug: null,
    name: "Martial Arts",
    level: 1,
    edition: "EDITION_2014",
    description:
      "With unarmed strikes or monk weapons (shortsword and any simple melee weapon without the two-handed or heavy property): use Dexterity instead of Strength for attack and damage rolls; deal 1d4 (L1–4), 1d6 (L5–10), 1d8 (L11–16), or 1d10 (L17+) damage; immediately after you take the Attack action on your turn, make one unarmed strike as a bonus action.",
  },
  {
    subclassSlug: null,
    name: "Martial Arts",
    level: 1,
    edition: "EDITION_2024",
    description:
      "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d6 (L1–4), 1d8 (L5–10), 1d10 (L11–16), or 1d12 (L17+) damage; make one bonus unarmed strike after the Attack action.",
  },

  // Ki: SRD 5.1 p.46 / PHB'14 p.77. Focus: PHB'24 pp.87-88 — a materially
  // different feature, not a text variant.
  {
    subclassSlug: null,
    name: "Ki",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You have a pool of Ki Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 ki — immediately after taking the Attack action, make two unarmed strikes as a bonus action), Patient Defense (1 ki — take the Dodge action as a bonus action), Step of the Wind (1 ki — take the Disengage or Dash action as a bonus action, jump distance doubled for the turn). Ki save DC = 8 + proficiency + Wisdom modifier. Regain all ki on a short or long rest.",
    resourceKey: "ki",
    resourceLabel: "Ki Points",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    // Perfect Self (PHB'14 p.79, L20): regain 4 ki on rolling initiative with none remaining.
    resourceOnInitiative: [{ id: "perfectSelf", minLevel: 20, amount: 4, threshold: 0 }],
  },
  {
    subclassSlug: null,
    name: "Focus",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You have a pool of Focus Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 focus — two bonus unarmed strikes), Patient Defense (free for Disengage as a bonus action, or 1 focus for Disengage + Dodge), Step of the Wind (free for Dash as a bonus action, or 1 focus for Disengage + Dash with jump distance doubled). Focus save DC = 8 + proficiency + Wisdom modifier. Regain all focus on a short or long rest.",
    resourceKey: "focus",
    resourceLabel: "Focus Points",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    // Uncanny Metabolism (PHB'24 p.87, L2) and Perfect Focus (PHB'24 p.88, L15) on rolling initiative.
    resourceOnInitiative: [
      {
        id: "uncannyMetabolism",
        amount: "all",
        oncePerLongRest: true,
        bonusHeal: { sourceName: "Uncanny Metabolism", dieFaces: "martialArtsDie", flatBonus: { levelTimes: 1 } },
      },
      { id: "perfectFocus", minLevel: 15, amount: 4 },
    ],
  },

  // PHB'24 p.87 — no 2014 counterpart.
  {
    subclassSlug: null,
    name: "Uncanny Metabolism",
    level: 2,
    edition: "EDITION_2024",
    description:
      "When you roll initiative, you can regain all expended Focus Points; when you do, roll your Martial Arts die and regain hit points equal to your monk level plus the number rolled. Usable once per long rest.",
  },

  // Deflect Missiles: SRD 5.1 p.46 / PHB'14 p.77, ranged only. Deflect
  // Attacks: PHB'24 p.87, any melee/ranged BPS damage with a Dexterity-save
  // redirect.
  {
    subclassSlug: null,
    name: "Deflect Missiles",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Use your reaction to reduce damage from a ranged weapon attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0 and the missile is small enough to hold in one hand with a hand free, you catch it. You can then spend 1 ki to make a ranged attack with it as part of the same reaction — range 20/60 ft, always made with proficiency — dealing 1d6 + Dexterity modifier bludgeoning damage to one creature within range on a hit.",
    resourceKey: "deflectMissiles",
    activationCost: "reaction",
    reminder:
      "Reaction: when hit by a ranged weapon attack, reduce the damage by 1d10 + Dex modifier + monk level. If this reduces it to 0 and you have a free hand, catch the missile.",
  },
  {
    subclassSlug: null,
    name: "Deflect Attacks",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Use your reaction to reduce bludgeoning, piercing, or slashing damage from a melee or ranged attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0, spend 1 focus to redirect it: the attacker (melee, within 5 ft) or another creature (ranged, within 60 ft) must succeed on a Dexterity save or take damage equal to two rolls of your Martial Arts die + your Dexterity modifier.",
    // damageTypeClause resolved by the Deflect Energy announce augmentor (lib/srd/deflect.ts), not a column here.
    resourceKey: "deflectAttacks",
    activationCost: "reaction",
    reminder:
      "Reaction: when hit by a melee or ranged attack dealing bludgeoning, piercing, or slashing damage (any damage type at L13, Deflect Energy), reduce the damage by 1d10 + Dex modifier + monk level.",
  },

  // SRD 5.1 p.46 / PHB'14 p.77 — no once-per-turn cap, no success rider (2014 Stunning Strike).
  {
    subclassSlug: null,
    name: "Stunning Strike",
    level: 5,
    edition: "EDITION_2014",
    description:
      "When you hit another creature with a melee weapon attack, you can spend 1 ki point to attempt a stunning strike. The target must succeed on a Constitution save (ki save DC) or be stunned until the end of your next turn. Unlike Flurry of Blows, this can be attempted more than once per turn as long as you have ki points to spend.",
  },
  {
    subclassSlug: null,
    name: "Stunning Strike",
    level: 5,
    edition: "EDITION_2024",
    description:
      "Once per turn when you hit with a monk weapon or unarmed strike, spend 1 focus to attempt a stunning strike. The target makes a Constitution save (focus save DC): on a failure it is stunned until the end of your next turn; on a success its speed is halved until the start of your next turn.",
  },

  // SRD 5.1 p.46 / PHB'14 p.77 (Ki-Empowered) vs PHB'24 p.87 (Empowered) —
  // 2024 adds an optional force-damage swap.
  {
    subclassSlug: null,
    name: "Ki-Empowered Strikes",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.",
  },
  {
    subclassSlug: null,
    name: "Empowered Strikes",
    level: 6,
    edition: "EDITION_2024",
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks, and can deal force damage instead of their normal damage type.",
  },

  // SRD 5.1 p.46 / PHB'14 p.77 — 2014-only, alongside the shared Evasion above.
  {
    subclassSlug: null,
    name: "Stillness of Mind",
    level: 7,
    edition: "EDITION_2014",
    description: "Use your action to end one effect on yourself that is causing you to be charmed or frightened.",
  },

  // PHB'24 p.88 — no 2014 counterpart (2014's own L10 feature is Purity of Body below).
  {
    subclassSlug: null,
    name: "Heightened Focus",
    level: 10,
    edition: "EDITION_2024",
    description:
      "Your focus features grow more potent: Flurry of Blows lets you make three unarmed strikes instead of two (still 1 focus); Patient Defense grants temporary hit points equal to two rolls of your Martial Arts die when you spend focus; Step of the Wind lets you bring one willing Large or smaller creature within 5 ft along with you when you spend focus.",
  },
  {
    subclassSlug: null,
    name: "Self-Restoration",
    level: 10,
    edition: "EDITION_2024",
    description:
      "At the end of each of your turns, you can end one Charmed, Frightened, or Poisoned effect on yourself for free. You also no longer suffer exhaustion from lack of food or water.",
  },

  // SRD 5.1 p.47 — no 2024 successor.
  {
    subclassSlug: null,
    name: "Purity of Body",
    level: 10,
    edition: "EDITION_2014",
    description: "You are immune to disease and poison.",
  },

  // Deflect Energy: PHB'24 p.88 (2024-only). Tongue of the Sun and Moon:
  // SRD 5.1 p.47 / PHB'14 p.78 (2014-only).
  {
    subclassSlug: null,
    name: "Deflect Energy",
    level: 13,
    edition: "EDITION_2024",
    description:
      "Your Deflect Attacks feature now works against an attack of any damage type, not just bludgeoning, piercing, or slashing.",
  },
  {
    subclassSlug: null,
    name: "Tongue of the Sun and Moon",
    level: 13,
    edition: "EDITION_2014",
    description:
      "You understand all spoken languages, and any creature that can understand a language understands what you say.",
  },

  // SRD 5.1 p.47 / PHB'14 p.78 (Diamond Soul) vs PHB'24 p.88 (Disciplined
  // Survivor) — identical mechanic, different name.
  {
    subclassSlug: null,
    name: "Diamond Soul",
    level: 14,
    edition: "EDITION_2014",
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 ki point to reroll it and take the second result.",
  },
  {
    subclassSlug: null,
    name: "Disciplined Survivor",
    level: 14,
    edition: "EDITION_2024",
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 focus to reroll it and take the second result.",
  },

  // Perfect Focus: PHB'24 p.88 (2024-only). Timeless Body: SRD 5.1 p.47 /
  // PHB'14 p.78 (2014-only).
  {
    subclassSlug: null,
    name: "Perfect Focus",
    level: 15,
    edition: "EDITION_2024",
    description:
      "When you roll initiative, if you have 3 or fewer focus points, you regain focus points until you have 4.",
  },
  {
    subclassSlug: null,
    name: "Timeless Body",
    level: 15,
    edition: "EDITION_2014",
    description:
      "Your ki sustains you so that you suffer none of the frailty of old age, and you can't be aged magically (though you can still die of old age). You no longer need food or water.",
  },

  // Superior Defense: PHB'24 p.89 (2024-only). Empty Body: SRD 5.1 p.48 /
  // PHB'14 p.78 (2014-only).
  {
    subclassSlug: null,
    name: "Superior Defense",
    level: 18,
    edition: "EDITION_2024",
    description:
      "At the start of your turn, spend 3 focus to bolster yourself for 1 minute or until you're incapacitated: during that time you have resistance to all damage except force damage.",
  },
  {
    subclassSlug: null,
    name: "Empty Body",
    level: 18,
    edition: "EDITION_2014",
    description:
      "Use your action to spend 4 ki points to become invisible for 1 minute; during that time you also have resistance to all damage but force damage. Additionally, you can spend 8 ki points to cast astral projection without expending a material component; when you do, you can't take any other creatures with you.",
  },

  // Body and Mind: PHB'24 (2024 capstone). Perfect Self: SRD 5.1 p.48 /
  // PHB'14 p.79 — its resourceOnInitiative lives on the "Ki" row above, not here.
  {
    subclassSlug: null,
    name: "Body and Mind",
    level: 20,
    edition: "EDITION_2024",
    description: "Your Dexterity and Wisdom scores each increase by 4, to a maximum of 25.",
  },
  {
    subclassSlug: null,
    name: "Perfect Self",
    level: 20,
    edition: "EDITION_2014",
    description: "When you roll initiative and have no ki points remaining, you regain 4 ki points.",
  },

  // actionOnly rows (#1912): no new feature card — only availableActions[] serves them.
  {
    subclassSlug: null,
    name: "Bonus Unarmed Strike",
    level: 1,
    description: "A free Unarmed Strike as a Bonus Action — no resource cost, gated on Martial Arts' unarmored/no-shield condition (see the Martial Arts feature).",
    resourceKey: "bonusUnarmedStrike",
    activationCost: "bonusAction",
    requiresUnarmored: true,
    actionOnly: true,
  },
  {
    subclassSlug: null,
    name: "Flurry of Blows",
    level: 2,
    edition: "EDITION_2024",
    description: "Immediately after the Attack action, spend 1 focus to make two Unarmed Strikes as a Bonus Action (three at Heightened Focus, monk L10).",
    resourceKey: "flurryOfBlows",
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    // count is the base strike count; Heightened Focus's bump to 3 is an
    // announce-augmentor payload (heightened-focus.ts), not a second row.
    count: 2,
    actionOnly: true,
  },
  {
    subclassSlug: null,
    name: "Flurry of Blows",
    level: 2,
    edition: "EDITION_2014",
    description: "Immediately after taking the Attack action, spend 1 ki to make two unarmed strikes as a bonus action.",
    resourceKey: "flurryOfBlows",
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    count: 2,
    reminder: "Immediately after taking the Attack action, spend 1 ki to make two unarmed strikes as a bonus action.",
    // Same resourceKey as the 2024 row above — safe because
    // ACTION_EFFECT_FN.flurryOfBlows resolves the pool via ctx.edition
    // (monkPoolKey), not a hardcoded key.
    actionOnly: true,
  },
  // PHB'24 p.98 / SRD 5.2 (#1240): each splits into a free variant and a
  // 1-Focus variant (2014 is a flat 1-ki cost, no free option). Heightened
  // Focus upgrades the *Focus entries in place (heightened-focus.ts).
  {
    subclassSlug: null,
    name: "Patient Defense",
    level: 2,
    edition: "EDITION_2024",
    description: "Take the Dodge action as a free Bonus Action (or, for 1 Focus, Disengage + Dodge together).",
    resourceKey: "patientDefense",
    activationCost: "bonusAction",
    regrants: ["disengage"],
    reminder: "Disengage (free bonus action).",
    actionOnly: true,
  },
  {
    subclassSlug: null,
    name: "Patient Defense (1 Focus)",
    level: 2,
    edition: "EDITION_2024",
    description: "Spend 1 Focus to take Disengage + Dodge together as a Bonus Action (also grants temporary hit points at Heightened Focus, monk L10).",
    resourceKey: "patientDefenseFocus",
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    regrants: ["disengage", "dodge"],
    reminder: "Disengage + Dodge (spend 1 Focus).",
    actionOnly: true,
  },
  {
    subclassSlug: null,
    name: "Step of the Wind",
    level: 2,
    edition: "EDITION_2024",
    description: "Take the Dash action as a free Bonus Action (or, for 1 Focus, Disengage + Dash with jump distance doubled).",
    resourceKey: "stepOfTheWind",
    activationCost: "bonusAction",
    regrants: ["dash"],
    reminder: "Dash (free bonus action).",
    actionOnly: true,
  },
  {
    subclassSlug: null,
    name: "Step of the Wind (1 Focus)",
    level: 2,
    edition: "EDITION_2024",
    description: "Spend 1 Focus to take Disengage + Dash together as a Bonus Action, jump distance doubled this turn (also brings a willing creature along at Heightened Focus, monk L10).",
    resourceKey: "stepOfTheWindFocus",
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    regrants: ["disengage", "dash"],
    reminder: "Disengage + Dash, jump distance doubled this turn (spend 1 Focus).",
    actionOnly: true,
  },
  // Distinct keys from the 2024 rows (not patientDefense/stepOfTheWind):
  // those are pinned serverEffect:false in the frontend's ACTION_RESOLVERS
  // for the free 2024 variant — reusing them here would render but silently
  // never spend.
  {
    subclassSlug: null,
    name: "Patient Defense",
    level: 2,
    edition: "EDITION_2014",
    description: "Spend 1 ki to take the Dodge action as a bonus action.",
    resourceKey: "patientDefenseKi",
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    regrants: ["dodge"],
    reminder: "Spend 1 ki to take the Dodge action as a bonus action.",
    actionOnly: true,
  },
  {
    subclassSlug: null,
    name: "Step of the Wind",
    level: 2,
    edition: "EDITION_2014",
    description: "Spend 1 ki to take the Disengage or Dash action as a bonus action; your jump distance is doubled for the turn.",
    resourceKey: "stepOfTheWindKi",
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    regrants: ["disengage", "dash"],
    reminder: "Spend 1 ki to take the Disengage or Dash action as a bonus action; your jump distance is doubled for the turn.",
    actionOnly: true,
  },
  // Only meaningful once Deflect Attacks reduces a hit to 0; spends Focus,
  // unlike the free base reduction above.
  {
    subclassSlug: null,
    name: "Deflect Attacks — Redirect",
    level: 3,
    edition: "EDITION_2024",
    description: "Once Deflect Attacks reduces a hit to 0, spend 1 Focus to redirect the damage at the attacker (melee) or another creature within range (ranged), forcing a Dexterity save.",
    resourceKey: "deflectAttacksRedirect",
    activationCost: "free",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    actionOnly: true,
  },
  // A catch-and-attack, not a save-forcing redirect — a real 1-ki spend,
  // unlike the free base reduction above.
  {
    subclassSlug: null,
    name: "Deflect Missiles — Throw Back",
    level: 3,
    edition: "EDITION_2014",
    description: "Once Deflect Missiles catches a missile, spend 1 ki to make a ranged attack with it — range 20/60 ft, always proficient — dealing 1d6 + Dex modifier bludgeoning on a hit.",
    resourceKey: "deflectMissilesThrow",
    activationCost: "free",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    reminder: "Spend 1 ki to make a ranged attack with the caught missile (range 20/60, always proficient) — 1d6 + Dex modifier bludgeoning on a hit.",
    actionOnly: true,
  },
  // No server effect beyond the spend itself — no buff/condition model for
  // invisibility or astral projection.
  {
    subclassSlug: null,
    name: "Empty Body — Invisibility",
    level: 18,
    edition: "EDITION_2014",
    description: "Spend 4 ki points to become invisible for 1 minute; during that time you also have resistance to all damage but force damage.",
    resourceKey: "emptyBody",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 4,
    reminder: "Spend 4 ki to become invisible for 1 minute, with resistance to all damage but force damage during that time.",
    actionOnly: true,
  },
  {
    subclassSlug: null,
    name: "Empty Body — Astral Projection",
    level: 18,
    edition: "EDITION_2014",
    description: "Spend 8 ki points to cast astral projection on yourself without a material component; you can't take other creatures with you.",
    resourceKey: "emptyBodyAstralProjection",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 8,
    reminder: "Spend 8 ki to cast astral projection on yourself without a material component; you can't take other creatures with you.",
    actionOnly: true,
  },
];

// Warrior of the Open Hand — SRD 5.2 p.90 (#1501). Way of the Open Hand
// below is a separate 2014 subclass, not a fork of this one — three shared
// feature names with genuinely different mechanics, plus Fleet Step/
// Tranquility with no cross-edition counterpart (#1430).
const WARRIOR_OF_THE_OPEN_HAND_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Open Hand Technique",
    level: 3,
    edition: "EDITION_2024",
    description:
      "When you hit a creature with an attack granted by your Flurry of Blows, you can impose one effect: Addle — the creature can't make Opportunity Attacks until the start of its next turn (no save); Push — the creature makes a Strength save or is pushed up to 15 ft away; or Topple — the creature makes a Dexterity save or is knocked prone.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Wholeness of Body",
    level: 6,
    edition: "EDITION_2024",
    description:
      "As a bonus action, roll your Martial Arts die and regain that many hit points plus your Wisdom modifier (minimum 1). Usable a number of times equal to your Wisdom modifier (minimum once); regain all expended uses on a long rest.",
    // SRD 5.2 / PHB'24 p.89: uses = Wisdom modifier (minimum 1).
    resourceKey: "wholenessOfBody",
    resourceTotals: [{ minLevel: 6, total: { abilityMod: "wisdom", min: 1 } }],
    resourceRecharge: "longRest",
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "wholenessOfBody",
    costBase: 1,
  },
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Fleet Step",
    level: 11,
    edition: "EDITION_2024",
    description:
      "When you take a bonus action other than Step of the Wind, you can also take the Step of the Wind bonus action immediately afterward.",
    resourceKey: "fleetStep",
    activationCost: "free",
    reminder: "When you take a bonus action other than Step of the Wind, you can also take Step of the Wind immediately afterward (no extra cost).",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Quivering Palm",
    level: 17,
    edition: "EDITION_2024",
    description:
      "When you hit with an unarmed strike, spend 4 focus to set imperceptible vibrations in the creature that last for a number of days equal to your monk level. They are harmless unless you use your action to end them — the creature then makes a Constitution save, taking 10d12 force damage on a failure or half as much on a success. You can maintain vibrations in only one creature at a time and can end them harmlessly at any time without using an action.",
  },
];

// Way of the Open Hand — SRD 5.1 p.78 / PHB'14 p.78. Open Hand Technique's
// Addle duration is the monk's own next turn (no save), longer than 2024's
// target-next-turn version. Quivering Palm's outcome mapping is INVERTED
// from 2024's: fail drops the target to 0 HP, success deals full 10d10
// necrotic (never halved) — transcribed as SRD 5.1 states it.
const WAY_OF_THE_OPEN_HAND_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-way-of-the-open-hand"),
    name: "Open Hand Technique",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Whenever you hit a creature with one of the attacks granted by your Flurry of Blows, you can impose one effect: it must succeed on a Dexterity save or be knocked prone; it must make a Strength save or you can push it up to 15 ft away from you; or it can't take reactions until the end of your next turn (no save).",
  },
  {
    subclassSlug: slug("monk-way-of-the-open-hand"),
    name: "Wholeness of Body",
    level: 6,
    edition: "EDITION_2014",
    description:
      "As an action, regain hit points equal to three times your monk level. You must finish a long rest before you can use this feature again.",
    // A FIXED total, unlike the 2024 sibling's Wis-mod-dependent formula (above).
    resourceKey: "wholenessOfBody",
    resourceLabel: "Wholeness of Body",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    subclassSlug: slug("monk-way-of-the-open-hand"),
    name: "Tranquility",
    level: 11,
    edition: "EDITION_2014",
    description:
      "At the end of a long rest, you gain the effect of a sanctuary spell that lasts until the start of your next long rest (the spell can end early as normal). The saving throw DC equals your ki save DC.",
    resourceKey: "tranquility",
    activationCost: "free",
    reminder: "At the end of a long rest, you gain the effect of sanctuary (DC = your ki save DC) until the start of your next long rest.",
  },
  {
    subclassSlug: slug("monk-way-of-the-open-hand"),
    name: "Quivering Palm",
    level: 17,
    edition: "EDITION_2014",
    description:
      "When you hit a creature with an unarmed strike, you can spend 3 ki points to start imperceptible vibrations in its body, lasting a number of days equal to your monk level. You can have only one creature under this effect at a time, and you can end the vibrations harmlessly without using an action. To end them harmfully, you and the target must be on the same plane of existence — use your action to force a Constitution save: on a failure the target drops to 0 hit points; on a success it takes 10d10 necrotic damage.",
  },
  // Own served identity ("wholenessOfBodyAction", not "wholenessOfBody")
  // because the row named "Wholeness of Body" above already claims that
  // name under @@unique([classId, subclassId, name, edition]) — this is an
  // actionOnly sibling spending the same pool via costPoolKey.
  {
    subclassSlug: slug("monk-way-of-the-open-hand"),
    name: "Wholeness of Body — Action",
    level: 6,
    edition: "EDITION_2014",
    description: "As an action, spend 1 use of Wholeness of Body to regain hit points equal to three times your monk level.",
    resourceKey: "wholenessOfBodyAction",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "wholenessOfBody",
    costBase: 1,
    actionOnly: true,
  },
];

// Warrior of Shadow — PHB'24 p.91 (#1246). Way of Shadow below is a separate
// 2014 subclass, not a fork of this one (#1502).
const WARRIOR_OF_SHADOW_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Shadow Arts",
    level: 3,
    edition: "EDITION_2024",
    description:
      "You know the Minor Illusion cantrip (Wisdom). Spend 1 focus to cast Darkness without material components; you can see through the darkness you create, and while it persists you can move it up to 30 ft as a bonus action. You also have Darkvision out to 60 ft, or your Darkvision's range increases by 60 ft if you already have it.",
  },
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Shadow Step",
    level: 6,
    edition: "EDITION_2024",
    description:
      "While in dim light or darkness, teleport as a bonus action to an unoccupied space you can see that is also in dim light or darkness (up to 60 ft), then make one unarmed strike as part of the same bonus action. You have advantage on the first melee attack you make before the end of the turn.",
    // Improved Shadow Step (L11) is an announce-augmentor payload (improved-shadow-step.ts), not a second row.
    resourceKey: "shadowStep",
    activationCost: "bonusAction",
    reminder: "Teleport up to 60 ft between areas of dim light or darkness; advantage on your first melee attack before the end of this turn. Make one unarmed strike immediately after teleporting.",
  },
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Improved Shadow Step",
    level: 11,
    edition: "EDITION_2024",
    description:
      "When you Shadow Step, you can spend 1 focus to ignore the requirement that your destination be in dim light or darkness.",
  },
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Cloak of Shadows",
    level: 17,
    edition: "EDITION_2024",
    description:
      "Spend 3 focus and use your action to become invisible and able to move through other creatures and objects as if they were difficult terrain, for 1 minute or until you're incapacitated. The invisibility ends early if you attack or cast a spell. While it lasts, Flurry of Blows costs no focus.",
    resourceKey: "cloakOfShadows",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 3,
    reminder: "Magic action, entirely within dim light or darkness: spend 3 focus to become invisible and move through creatures/objects as difficult terrain for 1 minute (or until incapacitated, or you end your turn in bright light). Flurry of Blows costs no focus while it lasts.",
  },
  // Separate row so the served name reads "Shadow Arts (Darkness)",
  // disambiguating from Way of Shadow's own "Shadow Arts" cast.
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Shadow Arts (Darkness)",
    level: 3,
    edition: "EDITION_2024",
    description: "Spend 1 focus to cast Darkness without material components; you can see through it and move it up to 30 ft as a bonus action while it persists.",
    resourceKey: "shadowArts",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    reminder: "Spend 1 focus to cast Darkness without material components; you can see through it and move it up to 30 ft as a bonus action while it persists.",
    actionOnly: true,
  },
];

// Way of Shadow — PHB'14 pp.79-80, not in SRD 5.1 (#1502). Distinct
// subclassSlug from Warrior of Shadow above (monk-way-of-shadow, not
// monk-warrior-of-shadow) — the two lineages coexist per campaign, never
// merged or substring-matched (#1339).
const WAY_OF_SHADOW_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-way-of-shadow"),
    name: "Shadow Arts",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Starting when you choose this tradition at 3rd level, you can use your ki to duplicate the effects of certain spells. As an action, you can spend 2 ki points to cast darkness, darkvision, pass without trace, or silence, without providing material components. Additionally, you gain the minor illusion cantrip if you don't already know it (PHB'14 pp.79-80 — not in SRD 5.1).",
    resourceKey: "shadowArts",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    reminder: "Spend 2 ki to cast darkness, darkvision, pass without trace, or silence, without material components (PHB'14 pp.79-80 — not in SRD 5.1).",
  },
  {
    subclassSlug: slug("monk-way-of-shadow"),
    name: "Shadow Step",
    level: 6,
    edition: "EDITION_2014",
    description:
      "At 6th level, you gain the ability to step from one shadow to another. When you are in dim light or darkness, as a bonus action you can teleport up to 60 feet to an unoccupied space you can see that is also in dim light or darkness. You then have advantage on the first melee attack you make before the end of the current turn (PHB'14 p.80 — not in SRD 5.1).",
    // Never upgrades — no Improved Shadow Step in 2014 (unlike the 2024 sibling).
    resourceKey: "shadowStep",
    activationCost: "bonusAction",
    reminder: "While in dim light or darkness, teleport as a bonus action up to 60 ft to an unoccupied space you can see that is also in dim light or darkness; you then have advantage on the first melee attack you make before the end of the turn.",
  },
  {
    subclassSlug: slug("monk-way-of-shadow"),
    name: "Cloak of Shadows",
    level: 11,
    edition: "EDITION_2014",
    description:
      "By 11th level, you have learned to become one with the shadows. When you are in an area of dim light or darkness, you can use your action to become invisible. You remain invisible until you make an attack, cast a spell, or are in an area of bright light (PHB'14 p.80 — not in SRD 5.1).",
    // No ki cost, no duration cap (unlike the 2024 sibling's 3-focus/1-minute version).
    resourceKey: "cloakOfShadows",
    activationCost: "action",
    reminder: "While in dim light or darkness, use your action to become invisible; you remain invisible until you make an attack, cast a spell, or are in an area of bright light. No ki cost, no duration cap.",
  },
  {
    subclassSlug: slug("monk-way-of-shadow"),
    name: "Opportunist",
    level: 17,
    edition: "EDITION_2014",
    description:
      "Beginning at 17th level, you can exploit a creature's momentary distraction when it is hit by an attack. When a creature within 5 feet of you is hit by an attack made by a creature other than you, you can use your reaction to make a melee attack against that creature (PHB'14 p.80 — not in SRD 5.1).",
    // No 2024 equivalent — retired there in favor of Cloak of Shadows.
    resourceKey: "opportunist",
    activationCost: "reaction",
    reminder: "When a creature within 5 ft of you is hit by an attack made by a creature other than you, use your reaction to make a melee attack against that creature.",
  },
];

// Warrior of Mercy — PHB'24 p.92, not in SRD 5.2 (gap-fill content, #1248).
// Rows stay untagged/shared — no 2014 slug exists yet; retagging is #1972.
const WARRIOR_OF_MERCY_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Implements of Mercy",
    level: 3,
    description: "You gain proficiency in the Insight and Medicine skills and with the Herbalism Kit.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Harm",
    level: 3,
    description:
      "Once per turn when you hit a creature with an unarmed strike and deal damage, you can expend 1 focus to deal extra necrotic damage equal to one Martial Arts die plus your Wisdom modifier.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Healing",
    level: 3,
    description:
      "As a Magic action, expend 1 focus to touch a creature and restore hit points equal to one Martial Arts die plus your Wisdom modifier. When you use Flurry of Blows, you can replace one of its unarmed strikes with this effect without spending the extra focus for the heal — Flurry's own focus cost still applies.",
    // Physician's Touch (L6) upgrades this in place (physicians-touch.ts), not a second row.
    resourceKey: "handOfHealing",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    reminder: "Magic action: expend 1 Focus to heal a creature you touch (Martial Arts die + Wis mod).",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Physician's Touch",
    level: 6,
    description:
      "Hand of Harm also inflicts the Poisoned condition on the target until the end of your next turn. Hand of Healing also ends one of the following conditions on the target: Blinded, Deafened, Paralyzed, Poisoned, or Stunned.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Flurry of Healing and Harm",
    level: 11,
    description:
      "When you use Flurry of Blows, you can replace each of its unarmed strikes with Hand of Healing, and you can apply Hand of Harm to one of its strikes without spending focus (Hand of Harm's once-per-turn limit still applies). Usable a number of times equal to your Wisdom modifier (minimum once) per long rest.",
    resourceKey: "flurryOfHealingAndHarm",
    resourceTotals: [{ minLevel: 11, total: { abilityMod: "wisdom", min: 1 } }],
    resourceRecharge: "longRest",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Ultimate Mercy",
    level: 17,
    description:
      "As a Magic action, expend 5 focus to touch a creature that died no more than 24 hours ago and return it to life with 4d10 plus your Wisdom modifier hit points, ending the Blinded, Deafened, Paralyzed, Poisoned, and Stunned conditions on it. Usable once per long rest.",
    resourceKey: "handOfUltimateMercy",
    resourceTotals: [{ minLevel: 17, total: 1 }],
    resourceRecharge: "longRest",
  },
  // Costs no Focus of its own — it swaps in for one of Flurry of Blows'
  // unarmed strikes, which already spent Focus.
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Healing (Flurry replacement)",
    level: 3,
    description: "Replace one Unarmed Strike from Flurry of Blows with Hand of Healing at no extra Focus cost.",
    resourceKey: "handOfHealingFlurry",
    activationCost: "bonusAction",
    reminder: "Replace one Unarmed Strike from Flurry of Blows with Hand of Healing at no extra Focus cost. Flurry of Healing and Harm (L11): replace every strike this way.",
    actionOnly: true,
  },
];

// Warrior of the Elements — 2024 rebuild of Way of the Four Elements (PHB'24
// p.90, #1503). Elemental Attunement is a while-active buff plus two
// Focus-spending session actions (toggle + Elemental Burst) — see
// warrior-of-elements.ts. Every row tagged EDITION_2024.
const WARRIOR_OF_THE_ELEMENTS_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Manipulate Elements",
    level: 3,
    edition: "EDITION_2024",
    description: "You know the Elementalism cantrip. Wisdom is your spellcasting ability for it.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Elemental Attunement",
    level: 3,
    edition: "EDITION_2024",
    description:
      "At the start of your turn, you can expend 1 Focus Point (no action) to imbue yourself with elemental energy for 10 minutes (or until you're Incapacitated). While attuned: your Unarmed Strike reach increases by 10 ft; and once per Unarmed Strike hit you can deal Acid, Cold, Fire, Lightning, or Thunder damage instead of the normal type — when you do, you can force the target to make a Strength saving throw (your focus save DC), moving it up to 10 ft in a direction of your choice on a failure.",
    // Toggle half only — Elemental Burst/Elemental Strike's own save-DC
    // damage mechanics stay in warrior-of-elements.ts. The buff is
    // state-tracking only: attunementActive() reads its presence, never its
    // modifier value.
    resourceKey: "elementalAttunement",
    activationCost: "free",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    effectBuffs: [
      {
        key: "elementalAttunement",
        target: "elementalAttunement",
        modifier: 0,
        duration: "while-active",
      },
    ],
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Elemental Burst",
    level: 6,
    edition: "EDITION_2024",
    description:
      "As a Magic action, you can expend 2 Focus Points to create a 20-foot-radius sphere of elemental energy centered on a point within 120 ft. Choose Acid, Cold, Fire, Lightning, or Thunder. Each creature in the sphere makes a Dexterity saving throw (your focus save DC), taking damage equal to three rolls of your Martial Arts die of the chosen type on a failure, or half as much on a success.",
    // The save-DC damage op stays in warrior-of-elements.ts (castElementalBurst).
    resourceKey: "elementalBurst",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 2,
    reminder: "Magic action, 2 focus: 20-ft-radius sphere within 120 ft, chosen damage type. Each creature makes a Dexterity save (focus DC) — 3 Martial Arts dice on a failure, half as much on a success.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Stride of the Elements",
    level: 11,
    edition: "EDITION_2024",
    description: "While your Elemental Attunement is active, you have a Fly Speed and a Swim Speed each equal to your Speed.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Elemental Epitome",
    level: 17,
    edition: "EDITION_2024",
    description:
      "While your Elemental Attunement is active you gain: Resistance to Acid, Cold, Fire, Lightning, or Thunder damage (choose one at the start of each of your turns); Destructive Stride (when you use Step of the Wind, your Speed increases by 20 ft that turn, and the first creature you move within 5 ft of takes one roll of your Martial Arts die of your chosen resistance type); and Empowered Strikes (once per turn, one Unarmed Strike deals an extra Martial Arts die of your chosen resistance type on a hit).",
  },
];

// Way of the Four Elements — 2014-only, PHB'14 pp.78, 80-81, not in SRD 5.1
// (#1503). The discipline catalog is disciplines.ts (16 rows, source
// "discipline"); choiceCountTiers' count is the discipline SLOT cap, not the
// total known (which also includes the always-known Elemental Attunement):
// 1/2/3/4 at L3/6/11/17, so total known reads 2/3/4/5 — do not "fix" this to
// 2/3/4/5.
const WAY_OF_THE_FOUR_ELEMENTS_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-way-of-the-four-elements"),
    name: "Disciple of the Elements",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You learn magical disciplines that harness the power of the four elements. You know Elemental Attunement plus one other elemental discipline of your choice, learning one more at 6th, 11th, and 17th level (2/3/4/5 known total). A discipline requires you to spend ki points each time you use it, and some disciplines require you to reach a specified monk level before you can use them. Whenever you learn a new elemental discipline, you can also replace one you already know with a different discipline. PHB'14 pp. 78, 80.",
    choiceKey: "fourElementsDisciplines",
    choiceLabel: "Elemental Disciplines",
    choiceCatalogSource: "discipline",
    choiceCountTiers: [
      { minLevel: 3, count: 1 },
      { minLevel: 6, count: 2 },
      { minLevel: 11, count: 3 },
      { minLevel: 17, count: 4 },
    ],
  },
  {
    subclassSlug: slug("monk-way-of-the-four-elements"),
    name: "Elemental Attunement",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You always know this elemental discipline, and it doesn't count against the number of elemental disciplines you know. As an action, you can briefly control elemental forces within 30 ft of you, causing one of the following effects: create a harmless, sensory elemental effect; instantaneously light or snuff out a candle, torch, or small campfire; chill or warm up to 1 pound of nonliving material for up to 1 hour; or shape a small amount of nonliving earth, fire, water, or mist for up to 1 minute. PHB'14 p.80.",
    // Free and uncapped — a materially different feature from 2024's
    // Focus-fuelled toggle, not a text variant.
    resourceKey: "elementalAttunement",
    activationCost: "action",
    reminder: "Briefly control elemental forces within 30 ft: create a harmless sensory effect; light or snuff a small flame; chill or warm up to 1 lb of nonliving material for 1 hour; or shape a small amount of nonliving earth, fire, water, or mist for 1 minute. Free — always known, no ki cost.",
  },
  // A discoverability/gate tile only — the real cast dispatches through
  // POST /api/characters/:id/abilities/disciplines/transactions
  // (disciplines.ts), not this table's generic action-execute path.
  {
    subclassSlug: slug("monk-way-of-the-four-elements"),
    name: "Elemental Discipline",
    level: 3,
    edition: "EDITION_2014",
    description: "Spend ki to cast a known elemental discipline (2-6 ki, capped by your monk level).",
    resourceKey: "castDiscipline",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    reminder: "Spend ki to cast a known elemental discipline (2-6 ki, capped by your monk level).",
    actionOnly: true,
  },
];

// 33 EDITION_2014 + 37 EDITION_2024 feature rows, plus the actionOnly rows
// (43/46 in total) — all four counts pinned by the monk 2024 content test.
export const MONK_FEATURES: ClassFeatureSeedRow[] = [
  ...MONK_BASE_RAW.flatMap(expand),
  ...WARRIOR_OF_THE_OPEN_HAND_RAW.flatMap(expand),
  ...WAY_OF_THE_OPEN_HAND_RAW.flatMap(expand),
  ...WARRIOR_OF_SHADOW_RAW.flatMap(expand),
  ...WAY_OF_SHADOW_RAW.flatMap(expand),
  ...WARRIOR_OF_MERCY_RAW.flatMap(expand),
  ...WARRIOR_OF_THE_ELEMENTS_RAW.flatMap(expand),
  ...WAY_OF_THE_FOUR_ELEMENTS_RAW.flatMap(expand),
];
