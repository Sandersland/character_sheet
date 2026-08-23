// Wizard ClassFeature rows, authored as literal seed data. Base class and
// Evoker are transcribed from the SRD 5.2 CC-BY document, cross-checked
// against two independent mirrors. Abjurer and Illusionist aren't in SRD 5.2
// at all, so their 2024 text is mirror-sourced from those same two sources.
//
// DATA MODULE ONLY: no direct database calls or async write logic may live in this file.
//
// `edition` omitted on a row -> expand() seeds one row per edition with
// identical text; `edition` set -> exactly the one row named. A "removed in
// 2024" feature means NOT authoring a 2024 row for that name, never deleting
// the 2014 row, and a level-shift is two rows with two `level` values, never
// one row edited in place.
//
// Arcane Recovery's and Illusory Self's resource-pool descriptor columns
// reproduce their retired resourceFns' totals exactly (flat total 1,
// longRest; flat total 1 from level 10, short-or-long). Neither pool gets a
// shortRestRegain tier — Illusory Self's 2024 slot-expend restore is a
// player-initiated cost, not a rest regain, and stays text-only.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type {
  ActivationRequirement,
  EffectBuffRow,
  ResourceTotalFormula,
} from "../../src/lib/classes/class-feature-rows.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time.
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`wizard-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawWizardFeature {
  // fallow-ignore-next-line code-duplication -- the descriptor-column field list intentionally mirrors fighter-features.ts's/class-features.ts's own shape (#1676's "widen to fighter's field set" instruction); each Raw*Feature interface is authored independently per class file by existing convention (barbarian-features.ts, cleric-features.ts, ...), never a shared base type
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions. */
  edition?: SeedEdition;
  // Only Arcane Recovery's/Illusory Self's/Bladesong's rows below ever set these.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  // fallow-ignore-next-line code-duplication -- same intentional per-class-file mirror as the comment two fields up (fighter-features.ts's own resourceTotals..saveDcAbilities block)
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  activationCost?: string;
  resolverKind?: string;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
  effectKind?: string;
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifierSource?: string;
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  saveDcAbilities?: string[];
  effectBuffs?: EffectBuffRow[];
  activationRequires?: ActivationRequirement[];
  improvements?: FeatImprovement[];
}

function expand(raw: RawWizardFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Wizard",
    // fallow-ignore-next-line code-duplication -- expand()'s field-by-field copy intentionally mirrors fighter-features.ts's own expand() (every Raw*Feature -> ClassFeatureSeedRow adapter across this file family repeats this shape by convention, never a shared helper)
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    resourceDieTiers: raw.resourceDieTiers,
    activationCost: raw.activationCost,
    resolverKind: raw.resolverKind,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
    effectKind: raw.effectKind,
    effectDiceCount: raw.effectDiceCount,
    effectDiceFaces: raw.effectDiceFaces,
    effectModifierSource: raw.effectModifierSource,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
    saveDcAbilities: raw.saveDcAbilities,
    effectBuffs: raw.effectBuffs,
    activationRequires: raw.activationRequires,
    improvements: raw.improvements,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// Base class — PHB'14 p.114 (2014) / SRD 5.2 (2024).
const WIZARD_BASE_RAW: RawWizardFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Intelligence. Full-caster progression. You copy spells into your spellbook and prepare a number equal to your Intelligence modifier + your wizard level (minimum 1) after each long rest.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: Prepared Spells is now a flat table, not an Intelligence-modifier formula.
    description:
      "You cast spells using Intelligence. Full-caster progression. You know three Wizard cantrips (one more at levels 4 and 10), replacing one on a Long Rest. Your spellbook holds your level 1+ spells: it starts with six 1st-level spells, and you add two spells of your choice whenever you gain a Wizard level after 1st. You regain all expended spell slots on a Long Rest, and you change your list of prepared spells whenever you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Arcane Recovery",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Once per day when finishing a short rest, choose expended spell slots to recover. Total levels of slots recovered can be up to half your wizard level (rounded up, max 5th-level slots).",
    // The slot-level cap itself is computed at op time (resolveArcaneRecoveryContext), not a tier.
    resourceKey: "arcaneRecovery",
    resourceLabel: "Arcane Recovery",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    subclassSlug: null,
    name: "Arcane Recovery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: the same mechanic as 2014 (once per Long Rest, recover slots up to half Wizard level, none 6th or higher).
    description:
      "When you finish a Short Rest, you can choose expended spell slots to recover, their combined level no higher than half your Wizard level (rounded up) and none 6th level or higher. You can use this feature only once per Long Rest.",
    resourceKey: "arcaneRecovery",
    resourceLabel: "Arcane Recovery",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    subclassSlug: null,
    name: "Ritual Adept",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "You can cast any spell in your spellbook as a Ritual if the spell has the Ritual tag, without needing it prepared — you must read from the book to cast it this way.",
  },
  {
    subclassSlug: null,
    name: "Scholar",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "Choose one skill in which you're proficient from Arcana, History, Investigation, Medicine, Nature, or Religion. You have Expertise in the chosen skill.",
    // The pick cap is per-character (shared across every grantor), not a
    // per-feature allowed-skill list, so this is over-permissive relative to
    // RAW's six-skill restriction — disclosed, not silently narrower.
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [{ minLevel: 2, value: 1 }],
  },
  {
    subclassSlug: null,
    name: "Memorize Spell",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "When you finish a Short Rest, you can study your spellbook and replace one of the level 1+ Wizard spells you have prepared with another level 1+ spell from the book.",
  },
  {
    subclassSlug: null,
    name: "Spell Mastery",
    level: 18,
    edition: "EDITION_2014",
    description:
      "Choose one 1st-level and one 2nd-level wizard spell in your spellbook. You can cast each of those spells at their lowest level without expending a spell slot. Changing choices requires 8 hours of study.",
  },
  {
    subclassSlug: null,
    name: "Spell Mastery",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2: restricts both picks to spells with a casting time of an action, and requires a full Long Rest, not 8 hours, to change them.
    description:
      "Choose a 1st-level and a 2nd-level spell in your spellbook, each with a casting time of an action. You always have both prepared, and you can cast each at its lowest level without expending a spell slot — casting at a higher level still costs a slot. Whenever you finish a Long Rest, you can study your spellbook and replace either choice with an eligible spell of the same level.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. Text only — the feat system itself is deferred.
    description: "You gain an Epic Boon feat of your choice (Boon of Spell Recall recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Signature Spells",
    level: 20,
    edition: "EDITION_2014",
    description:
      "Choose two 3rd-level wizard spells in your spellbook as signature spells. They are always prepared and don't count against your prepared spells count. You can cast each once without expending a slot; regain both uses after a short or long rest.",
  },
  {
    subclassSlug: null,
    name: "Signature Spells",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2: no "casting time of an action" restriction on these two picks (that restriction belongs only to Spell Mastery above).
    description:
      "Choose two 3rd-level spells in your spellbook as your signature spells. You always have them prepared, and you can cast each once at 3rd level without expending a spell slot. To cast either at a higher level, you must expend a spell slot; regain both uses after a Short Rest or Long Rest.",
  },
];

// School of Evocation -> Evoker — SRD 5.2 (2024). PHB'14 p.117 (2014).
const EVOCATION_SLUG = slug("wizard-school-of-evocation");
const EVOCATION_RAW: RawWizardFeature[] = [
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Evocation Savant",
    level: 2,
    edition: "EDITION_2014",
    description: "The gold and time you must spend to copy an evocation spell into your spellbook is halved.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Evocation Savant",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2: drops the halved-copy-cost mechanic, replaced by free Evocation spells added to the spellbook.
    description:
      "Add two Evocation spells (each level 2 or lower) to your spellbook for free. Thereafter, whenever you gain access to a new level of spell slots, add one more Evocation spell of an eligible level to your spellbook for free.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Sculpt Spells",
    level: 2,
    edition: "EDITION_2014",
    description:
      "When you cast an evocation spell, choose a number of creatures equal to 1 + the spell's level. Those creatures automatically succeed on their saving throw and take no damage (even if they'd normally take half on a success).",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Sculpt Spells",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2: level-shifts 2 -> 6; mechanic unchanged.
    description:
      "When you cast an Evocation spell that affects other creatures you can see, choose a number of them equal to 1 plus the spell's level. Those creatures automatically succeed on their saving throws against the spell, and they take no damage if they would normally take half damage on a success.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Potent Cantrip",
    level: 6,
    edition: "EDITION_2014",
    description: "When a creature succeeds on a saving throw against your cantrip, it takes half the cantrip's damage rather than none.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Potent Cantrip",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2: level-shifts 6 -> 3, and now also triggers on a missed attack roll.
    description:
      "When you cast a damaging cantrip at a creature and you miss with the attack roll, or the target succeeds on its saving throw against the cantrip, the target still takes half the cantrip's damage (if any), but suffers no other effect from it.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Empowered Evocation",
    level: 10,
    edition: "EDITION_2014",
    description: "Add your Intelligence modifier to one damage roll of any evocation spell you cast.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Empowered Evocation",
    level: 10,
    edition: "EDITION_2024",
    description: "Whenever you cast a Wizard spell from the Evocation school, you can add your Intelligence modifier to one damage roll of that spell.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Overchannel",
    level: 14,
    edition: "EDITION_2014",
    description:
      "When you cast a wizard spell of 1st–5th level that deals damage, you can deal maximum damage with it. The first time per long rest you do so, you suffer no ill effect. Each use thereafter costs 2d12 necrotic per spell level (before the rest).",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Overchannel",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2: the necrotic cost rises by a further 1d12 per spell level on each use — the 2014 row's flat cost every time is a genuine mechanical difference.
    description:
      "When you cast a Wizard spell with a spell slot of levels 1-5 that deals damage, you can deal maximum damage with it. The first time you do this before finishing a Long Rest, you suffer no adverse effect. Each further time before that Long Rest, you take 2d12 Necrotic damage for each level of the spell slot, and that damage per spell level increases by 1d12 for each additional use — this damage ignores Resistance and Immunity.",
  },
];

// School of Abjuration -> Abjurer — PHB'24 (mirror-sourced; not in SRD 5.2). 2014: PHB'14 p.116.
const ABJURATION_SLUG = slug("wizard-school-of-abjuration");
const ABJURATION_RAW: RawWizardFeature[] = [
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Abjuration Savant",
    level: 2,
    edition: "EDITION_2014",
    description: "The gold and time you must spend to copy an abjuration spell into your spellbook is halved.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Abjuration Savant",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). Drops the halved-copy-cost mechanic for the same free-spells shape as Evocation Savant above.
    description:
      "Add two Abjuration spells (each level 2 or lower) to your spellbook for free. Thereafter, whenever you gain access to a new level of spell slots, add one more Abjuration spell of an eligible level to your spellbook for free.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Arcane Ward",
    level: 2,
    edition: "EDITION_2014",
    description:
      "When you cast an abjuration spell of 1st level or higher, a magical ward forms with HP equal to twice your wizard level + your Intelligence modifier. The ward absorbs damage before you do, and is recharged (2× the spell's level) each time you cast an abjuration spell.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Arcane Ward",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). Level-shifts 2 -> 3; the ward can also be recharged as a Bonus Action by expending a spell slot outright.
    description:
      "When you cast an Abjuration spell with a spell slot, form (or recharge) a magical ward on yourself lasting until you finish a Long Rest, with HP equal to twice your Wizard level plus your Intelligence modifier. The ward absorbs damage before you do — apply any Resistances or Vulnerabilities you have before its HP is reduced — and it regains HP equal to twice the spell slot's level each time you cast an Abjuration spell with a slot, or, as a Bonus Action, by expending a spell slot for the same regain.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Projected Ward",
    level: 6,
    edition: "EDITION_2014",
    description: "When a creature within 30 ft takes damage, use your reaction to have your Arcane Ward absorb that damage instead.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Projected Ward",
    level: 6,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced).
    description:
      "When a creature you can see within 30 feet of yourself takes damage, you can take a Reaction to have your Arcane Ward absorb that damage instead — apply that creature's Resistances or Vulnerabilities before the ward's HP is reduced.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Improved Abjuration",
    level: 10,
    edition: "EDITION_2014",
    description: "When you cast an abjuration spell that requires an ability check, you add your proficiency bonus to that check.",
  },
  // Improved Abjuration has NO EDITION_2024 row — Spell Breaker below fills its L10 slot instead.
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Spell Breaker",
    level: 10,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). NEW in 2024. Text only: Counterspell/Dispel
    // Magic being always-prepared can't be a SubclassGrantedSpell row —
    // that model has no `edition` column, and Subclass rows are edition-shared.
    description:
      "You always have Counterspell and Dispel Magic prepared. You can cast Dispel Magic as a Bonus Action, and you add your Proficiency Bonus to its ability check. A spell slot spent on either spell isn't expended if the spell fails to stop what it targeted.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Spell Resistance",
    level: 14,
    edition: "EDITION_2014",
    description: "You have advantage on saving throws against spells, and resistance to spell damage.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Spell Resistance",
    level: 14,
    edition: "EDITION_2024",
    description: "You have Advantage on saving throws against spells, and Resistance to the damage they deal.",
  },
];

// School of Illusion -> Illusionist — PHB'24 (mirror-sourced; not in SRD 5.2). 2014: PHB'14 p.117.
const ILLUSION_SLUG = slug("wizard-school-of-illusion");
const ILLUSION_RAW: RawWizardFeature[] = [
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusion Savant",
    level: 2,
    edition: "EDITION_2014",
    description: "The gold and time you must spend to copy an illusion spell into your spellbook is halved.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusion Savant",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). Same free-spells shape as Evocation/Abjuration Savant above.
    description:
      "Add two Illusion spells (each level 2 or lower) to your spellbook for free. Thereafter, whenever you gain access to a new level of spell slots, add one more Illusion spell of an eligible level to your spellbook for free.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Improved Minor Illusion",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You know the Minor Illusion cantrip (or a different wizard cantrip if you already know it). When you cast it, you can create both a sound and an image with a single casting.",
  },
  // Improved Minor Illusion's 2024 successor is a DIFFERENT name (Improved Illusions, below), never a same-named tagged pair.
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Improved Illusions",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). Renamed, level-shifted 2 -> 3, drops the
    // Verbal-component requirement, and extends range on longer-range spells.
    description:
      "You can cast Illusion spells without a Verbal component, and any Illusion spell you cast with a range of 10 feet or more has its range extended by 60 feet. You also know the Minor Illusion cantrip (or learn a different Wizard cantrip if you already know it, not counting against your cantrips known); you can create both a sound and an image with a single casting of it, and you can cast it as a Bonus Action.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Malleable Illusions",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you cast an illusion spell with a duration of 1 minute or longer, you can use your action to change the nature of that illusion (within its original parameters) while you can see it.",
  },
  // Malleable Illusions has NO EDITION_2024 row — Phantasmal Creatures below fills its L6 slot instead.
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Phantasmal Creatures",
    level: 6,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). NEW in 2024. Same schema gap as Abjurer's
    // Spell Breaker above: always-prepared grants can't be a SubclassGrantedSpell row.
    description:
      "You always have the Summon Beast and Summon Fey spells prepared. Casting either as its Illusion-school version (the summoned creature appears spectral) costs no spell slot, but halves the creature's Hit Points. Once you cast either spell this way, you must finish a Long Rest before doing so again.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusory Self",
    level: 10,
    edition: "EDITION_2014",
    description:
      "When a creature makes an attack roll against you, use your reaction to interpose an illusory duplicate — the attack automatically misses. Once used, you regain this ability on a short or long rest.",
    // Row's own `level: 10` is the gate; resourceTotals' minLevel: 10 restates
    // it for poolsFromRows, which reads tiers independent of the row's level filter.
    resourceKey: "illusorySelf",
    resourceLabel: "Illusory Self",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 10, total: 1 }],
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusory Self",
    level: 10,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). Adds a second recharge path: expending a level
    // 2+ spell slot restores the use early. That path has no descriptor
    // column (a player-initiated cost, not a rest regain) and stays text-only.
    description:
      "When a creature hits you with an attack roll, you can take a Reaction to interpose an illusory duplicate of yourself between the attacker and yourself. The attack automatically misses you, then the illusion dissipates. You regain your use of this feature on a Short Rest or Long Rest, or you can restore it early by expending a level 2+ spell slot (no action required).",
    resourceKey: "illusorySelf",
    resourceLabel: "Illusory Self",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 10, total: 1 }],
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusory Reality",
    level: 14,
    edition: "EDITION_2014",
    description:
      "When you cast an illusion spell of 1st level or higher, you can make one inanimate, nonmagical object part of the illusion real for 1 minute. The object can't deal damage or cause harm.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusory Reality",
    level: 14,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced). Mechanic unchanged; can now be made real as a Bonus Action while the spell is ongoing.
    description:
      "When you cast an Illusion spell with a spell slot, you can make one inanimate, nonmagical object that's part of the illusion real for 1 minute — usable as a Bonus Action while the spell is ongoing. The object can't deal damage or otherwise cause harm.",
  },
];

// Bladesinging — TCoE p.76 (2014). EDITION_2014 only — no SRD 5.2/PHB'24
// printing exists; crossEditionRejection + the tagged Subclass row are the
// whole 2024 story (a 2024 wizard picking this slug 400s). Every mechanic
// below rides the F1-F5 engine (formula pool totals,
// row-declared effectBuffs + generic toggle resolver, slot-shaped ability
// costs, declarative activationRequires + equip-driven clearing, passive
// improvements) with zero new ACTION_EFFECT_FN/resourceFn/hand-written gate.
const BLADESINGING_SLUG = slug("wizard-bladesinging");

// Bladesong can't be activated in medium/heavy armor or with a shield, and
// ends early if you don any of the three — light armor is deliberately
// absent from both lists (TCoE's whole point is that it doesn't interfere).
const BLADESONG_ARMOR_GATE = ["noMediumArmor", "noHeavyArmor", "noShield"] as const;
const BLADESONG_CLEAR_ON = ["equipMediumArmor", "equipHeavyArmor", "equipShield"] as const;

const BLADESINGING_RAW: RawWizardFeature[] = [
  {
    subclassSlug: BLADESINGING_SLUG,
    name: "Training in War and Song",
    level: 2,
    edition: "EDITION_2014",
    // TCoE p.76.
    description:
      "You gain proficiency with light armor, one type of one-handed melee weapon of your choice, and the Performance skill.",
    // The one-handed-weapon TYPE choice has no subclass-choice machinery to
    // back it — announce-only, the description above carries the instruction.
    improvements: [
      { target: "armorProficiency", amount: 1, key: "light" },
      { target: "skillProficiency", amount: 1, key: "performance" },
    ],
  },
  {
    subclassSlug: BLADESINGING_SLUG,
    name: "Bladesong",
    level: 2,
    edition: "EDITION_2014",
    // TCoE p.76. The Acrobatics/concentration bonuses and the end conditions
    // stay announce-only text (endReminder below), not a turn-hook predicate.
    // Song of Victory (L14) rides this same toggle via a level-gated
    // effectBuffs entry rather than its own row.
    description:
      "As a bonus action, weave a Bladesong that lasts 1 minute. While it lasts, you gain a bonus to your AC equal to your Intelligence modifier (minimum +1), your walking speed increases by 10 feet, you have advantage on Dexterity (Acrobatics) checks, and you gain a bonus to concentration checks equal to your Intelligence modifier (minimum +1). You have a number of uses of this feature equal to your proficiency bonus, regained on a long rest. You can't activate Bladesong while wearing medium or heavy armor or wielding a shield. At 14th level (Song of Victory), while your Bladesong is active you also add your Intelligence modifier to your melee weapon damage rolls.",
    resourceKey: "bladesong",
    resourceLabel: "Bladesong",
    resourceRecharge: "longRest",
    // Proficiency-bonus uses per long rest — TCoE's own number, not a flat/tiered count.
    resourceTotals: [{ minLevel: 2, total: "proficiencyBonus" }],
    activationCost: "bonusAction",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "bladesong",
    costBase: 1,
    activationRequires: [...BLADESONG_ARMOR_GATE],
    // One ActiveBuff carries exactly one target/modifier pair, so a 3-target
    // toggle needs 3 entries, each with its own key (appendActiveBuffInTx
    // dedupes by key). Only the AC entry uses the row's identity key
    // ("bladesong") itself, which is what Song of Defense's
    // requiresActiveBuff gate below checks for.
    effectBuffs: [
      {
        key: "bladesong",
        target: "ac",
        modifier: { abilityMod: "intelligence", min: 1 },
        duration: "while-active",
        clearOn: [...BLADESONG_CLEAR_ON],
        endReminder:
          "Bladesong ends after 1 minute, or early if you're incapacitated, don medium or heavy armor or a shield, or make a weapon attack using two hands.",
      },
      {
        key: "bladesongSpeed",
        target: "speed",
        modifier: 10,
        duration: "while-active",
        clearOn: [...BLADESONG_CLEAR_ON],
      },
      {
        // Song of Victory (L14): absent below level 14, present without a second activation once reached.
        key: "bladesongMeleeDamage",
        target: "meleeDamage",
        modifier: { abilityMod: "intelligence", min: 1 },
        duration: "while-active",
        minLevel: 14,
        clearOn: [...BLADESONG_CLEAR_ON],
      },
    ],
  },
  {
    subclassSlug: BLADESINGING_SLUG,
    name: "Extra Attack",
    level: 6,
    edition: "EDITION_2014",
    // TCoE p.76: the cantrip-substitution rider is announce text only — no cantrip-swap machinery exists.
    description:
      "You can attack twice, instead of once, whenever you take the Attack action on your turn. You can replace one of those attacks with a cast of one of your cantrips that has a casting time of 1 action.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 6, value: 2 }],
  },
  {
    subclassSlug: BLADESINGING_SLUG,
    name: "Song of Defense",
    level: 10,
    edition: "EDITION_2014",
    // TCoE p.76. The 5x-slot-level damage reduction is announce-only — the player applies the number the frontend interpolates.
    description:
      "While your Bladesong is active, you can use your reaction when you take damage to expend a spell slot and reduce that damage to yourself by 5 times the slot's level.",
    activationCost: "reaction",
    // costKind "slot": no dedicated resource pool, so resourceKey here is a
    // pure identity, not a poolsFromRows consumer. effectKind "utility" (no
    // dice) routes this through castAbilityWithSlotInTx rather than
    // applyRowDrivenActionInTx's pure-counter branch.
    resourceKey: "songOfDefense",
    resolverKind: "slot-picker",
    costKind: "slot",
    costBase: 1,
    effectKind: "utility",
    // Gated on Bladesong being active — named by Bladesong's own buff key above, not this row's resourceKey.
    activationRequires: [{ requiresActiveBuff: "bladesong" }],
  },
];

export const WIZARD_FEATURES: ClassFeatureSeedRow[] = [...WIZARD_BASE_RAW, ...EVOCATION_RAW, ...ABJURATION_RAW, ...ILLUSION_RAW, ...BLADESINGING_RAW].flatMap(expand);
