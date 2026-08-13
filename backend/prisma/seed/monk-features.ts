// --- Monk ClassFeature rows, authored as LITERAL data (#1675) --------------
// The twelfth and last retab (#1134/#1522's roster completion): Monk's rows
// no longer derive from lib/classes/monk.ts's AuthoredFeature[] arrays —
// they are transcribed/authored directly here, once, in their final DB-row
// shape, following the fighter-features.ts pattern (#1227) every other class
// already moved to. class-features.ts concatenates MONK_FEATURES onto the
// other eleven classes' literal rows to build CLASS_FEATURES; see its
// LITERAL_ROW_CLASSES export for the set (now all twelve).
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file.
// expand() below is pure content assembly, not seeding logic.
//
// SCOPE (#1675 transport, #1500 base-class rewrite, #1501 Open Hand fork,
// #1502 Shadow fork, #1503 Warrior of the Elements retag + Way of the Four
// Elements): #1675 moved every row here as a byte-identical transcription of
// what lib/classes/monk.ts's MONK_FEATURES / WARRIOR_OF_*_FEATURES said, both
// editions sharing one row. #1500 rewrites the 18 BASE-CLASS rows
// (MONK_BASE_RAW below) from real SRD 5.1 / PHB'14 text — a genuine content
// fork per feature, not a retag: several 2014 features have no 2024 name at
// all (Uncanny Metabolism/Heightened Focus/Self-Restoration/Perfect Focus are
// 2024-only; Stillness of Mind/Purity of Body/Tongue of the Sun and
// Moon/Timeless Body/Empty Body/Perfect Self are 2014-only), so the 2014
// partition is 17 rows against the 2024 partition's 18
// (monk-2024-content.test.ts's per-partition count pins this exactly).
// #1501 forks Warrior of the Open Hand into two SEPARATE subclasses —
// "Warrior of the Open Hand" stays EDITION_2024-only (its four rows tagged in
// that same commit) and "Way of the Open Hand" is authored fresh as
// EDITION_2014-only (SRD 5.1's only monastic tradition) — rather than one
// slug hosting both editions' text, since the 2014 and 2024 names genuinely
// differ (monk.ts's two SubclassDefinition entries are the same split).
// #1502 forks Warrior of Shadow the same way: its four rows are now tagged
// EDITION_2024 (they still exist under monk-warrior-of-shadow's slug, just no
// longer a both-editions transcription), and a NEW Way of Shadow subclass
// (monk-way-of-shadow, a DISTINCT slug) carries its own four EDITION_2014
// rows, real PHB'14 pp.79-80 content (not in SRD 5.1). #1503 retags Warrior
// of the Elements EDITION_2024 (its four rows, same "no longer shared" shape
// as #1501/#1502's retags) and adds Way of the Four Elements
// (monk-way-of-the-four-elements) as a brand-new 2014-only slug with NO 2024
// counterpart at all — Warrior of the Elements is a from-scratch PHB'24
// rebuild, not this subclass under a different edition tag, so there was
// nothing to retag it FROM; see resolveSubclassId, seed-class-features.ts for
// why a retagged Subclass row forces its ClassFeature rows to fork too (a
// shared/untagged row has nothing to resolve against once its Subclass row
// stops being NULL-edition). Warrior of Mercy is the one remaining
// 2024-only subclass still untouched — no 2014 monk subclass slug exists for
// it yet — so its rows stay a byte-identical transcription shared across
// both editions.
// monk.ts keeps its resourceFn for the ki/focus pool (now edition-forked, see
// monkPoolKey) and every subclass resourceFn unchanged (except Way of the
// Open Hand, which needs none — see monk.ts's own comment).
//
// Two rows carry descriptor columns, both already set on their source
// AuthoredFeature entries in monk.ts before this migration (#1530's Extra
// Attack tier, #1686's Elemental Attunement toggle block) — transcribed
// here unchanged, not new population:
//   - Extra Attack (base class, L5): derivedStat "attacksPerAction" with a
//     single flat tier (edition-invariant, SRD 5.1 / SRD 5.2 Monk).
//   - Elemental Attunement (Warrior of the Elements, L3): the toggle half
//     only (activationCost/resolverKind/resourceKey/costKind/costPoolKey/
//     costBase/effectBuffs) — Elemental Burst/Elemental Strike's own
//     save-DC damage mechanics stay in warrior-of-elements.ts, unchanged.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { EffectBuffRow } from "../../src/lib/classes/class-feature-rows.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list. Mirrors fighter-features.ts's slug().
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`monk-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawMonkFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /**
   * Omitted -> identical text seeded for both editions (a genuinely
   * edition-invariant feature, e.g. Unarmored Defense/Slow Fall/Extra
   * Attack). Set -> this row exists for ONE edition only, either because its
   * text diverges from its same-named counterpart (Martial Arts, Ki/Focus,
   * Deflect Missiles/Attacks, Stunning Strike, Ki-Empowered/Empowered
   * Strikes, Diamond Soul/Disciplined Survivor — #1430's "one description
   * cannot cite two documents" precedent) or because the feature has no
   * counterpart in the other edition at all (Uncanny Metabolism/Heightened
   * Focus/Self-Restoration/Perfect Focus are 2024-only; Stillness of
   * Mind/Purity of Body/Tongue of the Sun and Moon/Timeless Body/Empty
   * Body/Perfect Self are 2014-only). Subclass rows below still omit it
   * unconditionally — #1500-#1503's later slices.
   */
  edition?: SeedEdition;
  // ---- Descriptor columns (#1530/#1686/#1501), transcribed unchanged from
  // ---- their source AuthoredFeature entries (or, for #1501's Wholeness of
  // ---- Body, authored fresh as a row-owned FIXED total — #1134's
  // ---- discriminator: a flat, ability-score-independent pool total belongs
  // ---- on the row, not a resourceFn). Every other row leaves these
  // ---- undefined, which expand() passes straight through.
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // fallow-ignore-next-line code-duplication -- the descriptor-column field list intentionally mirrors fighter-features.ts's/wizard-features.ts's own shape (#1501 widens it onto Monk the same way #1676 widened it onto Wizard); each Raw*Feature interface is authored independently per class file by existing convention, never a shared base type
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  // fallow-ignore-next-line code-duplication -- same intentional per-class-file mirror as the comment three fields up (fighter-features.ts's/wizard-features.ts's own resourceTotals shape)
  resourceTotals?: { minLevel: number; total: number }[];
  activationCost?: string;
  resolverKind?: string;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
  effectBuffs?: EffectBuffRow[];
  // ---- #1912 (epic #1903, 4/4) — the 34-row monk/rogue/barbarian sweep.
  // Every field below mirrors ClassFeatureSeedRow's own vocabulary; see each
  // consuming row's own comment for why it needs the field.
  regrants?: string[];
  requiresUnarmored?: boolean;
  reminder?: string;
  count?: number;
  actionOnly?: boolean;
}

function expand(raw: RawMonkFeature): ClassFeatureSeedRow[] {
  // fallow-ignore-next-line code-duplication -- this expand()/base-object shape (and the MONK_BASE_RAW array of {subclassSlug,name,level,description,...} entries below it) intentionally mirrors barbarian-features.ts's own expand()/RAW array — each class's literal seed module is authored independently by existing convention (fighter-features.ts, wizard-features.ts, ...), never a shared base type; see wizard-features.ts's own identical suppression for the RawWizardFeature interface.
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Monk",
    // fallow-ignore-next-line code-duplication -- expand()'s field-by-field copy intentionally mirrors fighter-features.ts's/wizard-features.ts's own expand() (every Raw*Feature -> ClassFeatureSeedRow adapter across this file family repeats this shape by convention, never a shared helper)
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

// ---- Base class — SRD 5.1 p. 46-49 / PHB'14 pp.76-79 (2014) / SRD 5.2
// p.87-89 / PHB'24 pp.87-89 (2024). 17 EDITION_2014 rows + 18 EDITION_2024
// rows (35 total) — the two counts differ by exactly one because 2024 has
// TWO L10 features (Heightened Focus + Self-Restoration) against 2014's
// ONE (Purity of Body), while 2014 has one extra L7 feature of its own
// (Stillness of Mind, alongside the shared Evasion) that 2024 lacks — those
// two one-row deltas cancel to net +1 for 2024. Every other level's row
// count matches 1:1 between editions (see each row's own comment for
// whether that's a shared/untagged row or a same-level forked pair). Exact
// counts pinned by monk-2024-content.test.ts's per-partition assertion.
const MONK_BASE_RAW: RawMonkFeature[] = [
  // Edition-invariant (untagged, one row each — SRD 5.1 and SRD 5.2 agree
  // word-for-word on the mechanic, per #1313's "Do NOT fork" table).
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
    // #1530: edition-invariant (SRD 5.1 / SRD 5.2 Monk, Extra Attack) — one
    // flat tier, no further scaling at higher levels (unlike Fighter).
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

  // Martial Arts (L1) — die progression AND the Flurry/bonus-strike prereq
  // fork (SRD 5.1 p.46 requires the Attack action first; SRD 5.2 p.87 does
  // not) — #1430 precedent: one description can't cite two documents.
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

  // Ki (SRD 5.1 p.46 / PHB'14 p.77) / Focus (2024) — the resource pool
  // feature itself. 2014's Ki has no Uncanny Metabolism analog (below) and
  // its three ki-spend options are flat single-cost menus (Flurry always
  // needs the Attack action first; Patient Defense/Step of the Wind have no
  // free variant) — a materially different feature from 2024's Focus, not a
  // text variant of it.
  {
    subclassSlug: null,
    name: "Ki",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You have a pool of Ki Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 ki — immediately after taking the Attack action, make two unarmed strikes as a bonus action), Patient Defense (1 ki — take the Dodge action as a bonus action), Step of the Wind (1 ki — take the Disengage or Dash action as a bonus action, jump distance doubled for the turn). Ki save DC = 8 + proficiency + Wisdom modifier. Regain all ki on a short or long rest.",
  },
  {
    subclassSlug: null,
    name: "Focus",
    level: 2,
    edition: "EDITION_2024",
    description:
      "You have a pool of Focus Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 focus — two bonus unarmed strikes), Patient Defense (free for Disengage as a bonus action, or 1 focus for Disengage + Dodge), Step of the Wind (free for Dash as a bonus action, or 1 focus for Disengage + Dash with jump distance doubled). Focus save DC = 8 + proficiency + Wisdom modifier. Regain all focus on a short or long rest.",
  },

  // Uncanny Metabolism — NEW in 2024 (PHB'24 p.87); SRD 5.1 has no L2
  // roll-initiative regen at all, so this row has no EDITION_2014 twin.
  {
    subclassSlug: null,
    name: "Uncanny Metabolism",
    level: 2,
    edition: "EDITION_2024",
    description:
      "When you roll initiative, you can regain all expended Focus Points; when you do, roll your Martial Arts die and regain hit points equal to your monk level plus the number rolled. Usable once per long rest.",
  },

  // Deflect Missiles (SRD 5.1 p.46 / PHB'14 p.77) / Deflect Attacks (2024) —
  // SRD 5.1's version is RANGED WEAPON ATTACKS ONLY (no melee), with a
  // catch-and-throw-back rider instead of 2024's Dexterity-save redirect. A
  // materially different feature under a different name, not a text variant
  // (#1313's fork table).
  {
    subclassSlug: null,
    name: "Deflect Missiles",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Use your reaction to reduce damage from a ranged weapon attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0 and the missile is small enough to hold in one hand with a hand free, you catch it. You can then spend 1 ki to make a ranged attack with it as part of the same reaction — range 20/60 ft, always made with proficiency — dealing 1d6 + Dexterity modifier bludgeoning damage to one creature within range on a hit.",
    // Row-driven action (#1912) — P: free, narrated, no resourceKey-gated
    // cost (the client rolls 1d10 + Dex + monk level directly, see
    // ACTION_EFFECT_FN's comment in actions.ts). The throw-back rider is its
    // own actionOnly row below ("Deflect Missiles — Throw Back").
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
    // Row-driven action (#1912) — P: the base reduction costs nothing (the
    // client rolls it directly); the redirect rider is its own actionOnly
    // row below ("Deflect Attacks — Redirect"). `damageTypeClause` is
    // resolved entirely by the Deflect Energy announce augmentor
    // (lib/srd/deflect.ts) — this row sets none.
    resourceKey: "deflectAttacks",
    activationCost: "reaction",
    reminder:
      "Reaction: when hit by a melee or ranged attack dealing bludgeoning, piercing, or slashing damage (any damage type at L13, Deflect Energy), reduce the damage by 1d10 + Dex modifier + monk level.",
  },

  // Stunning Strike (L5, SRD 5.1 p.46 / PHB'14 p.77) — 2014 has no
  // once-per-turn cap and no success rider (a failed save just does nothing
  // further); see lib/classes/stunning-strike.ts for the live-play
  // automation of this fork.
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

  // Ki-Empowered Strikes (SRD 5.1 p.46 / PHB'14 p.77) / Empowered Strikes
  // (2024) — same core mechanic (magical unarmed strikes), different
  // name/citation; 2024 adds an optional force-damage swap SRD 5.1 doesn't have.
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

  // Stillness of Mind (SRD 5.1 p.46 / PHB'14 p.77) — 2014-only, a SEPARATE
  // L7 feature alongside Evasion (which stays shared above); 2024 has no
  // counterpart (Self-Restoration, L10, is a broader but differently-scoped
  // replacement).
  {
    subclassSlug: null,
    name: "Stillness of Mind",
    level: 7,
    edition: "EDITION_2014",
    description: "Use your action to end one effect on yourself that is causing you to be charmed or frightened.",
  },

  // Heightened Focus / Self-Restoration — both NEW in 2024 (PHB'24 p.88),
  // sharing L10 with no 2014 counterpart of either name; 2014's own L10
  // feature is Purity of Body below.
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

  // Purity of Body — 2014's own L10 feature (SRD 5.1 p.47), no 2024 successor.
  {
    subclassSlug: null,
    name: "Purity of Body",
    level: 10,
    edition: "EDITION_2014",
    description: "You are immune to disease and poison.",
  },

  // Deflect Energy — 2024-only widening of Deflect Attacks to any damage
  // type; 2014's own L13 feature is Tongue of the Sun and Moon (SRD 5.1 p.47
  // / PHB'14 p.78) below (Deflect Missiles never widens beyond ranged weapon
  // attacks in SRD 5.1).
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

  // Diamond Soul (SRD 5.1 p.47 / PHB'14 p.78) / Disciplined Survivor (2024)
  // — identical mechanic (all-save proficiency + spend-1-to-reroll a failed
  // save), different name/citation (#1430 precedent).
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

  // Perfect Focus — 2024-only (PHB'24 p.88); 2014's own L15 feature is
  // Timeless Body (SRD 5.1 p.47 / PHB'14 p.78) below (a wholly different
  // effect at the same level).
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

  // Superior Defense — 2024-only (PHB'24 p.89); 2014's own L18 feature is
  // Empty Body (SRD 5.1 p.48 / PHB'14 p.78) below.
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

  // Body and Mind (2024) / Perfect Self (SRD 5.1 p.48 / PHB'14 p.79, 2014) —
  // different L20 capstones: 2024 is a flat +4/+4 ability-score bump, 2014
  // is a ki-shortfall safety net (regain 4 ki when you roll initiative with
  // none remaining) — see monk.ts's resourceFn for the onInitiative
  // descriptor this feature grants.
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

  // ---- #1912 (epic #1903, 4/4) — actionOnly rows: base-class action
  // identities with no feature-card text of their own (Martial Arts/Ki/Focus
  // already carry the player-facing prose above). `actionOnly: true` keeps
  // every one of these invisible to featuresFromRows (no new card) — only
  // `availableActions[]` ever surfaces them, matching the pre-migration
  // DERIVED_ACTIONS shape exactly (#1912's own "zero cards gained" AC).
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
  // `count` (#1505/#1912): resolved strike count the client renders
  // verbatim. 2 normally, 3 at Heightened Focus (monk L10, #1244) — the
  // bump is an announce-augmentor payload (heightened-focus.ts), not a
  // second row.
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
    count: 2,
    actionOnly: true,
  },
  // 2014 (SRD 5.1 / PHB'14 p.77): flat 1-ki cost, no Heightened Focus
  // three-strike upgrade (2024-only). Same served key as the row above
  // (mirrors Lay on Hands' own same-key edition fork) — safe because
  // ACTION_EFFECT_FN.flurryOfBlows resolves its pool through ctx.edition
  // (monkPoolKey) rather than a hardcoded key.
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
    actionOnly: true,
  },
  // Patient Defense / Step of the Wind (PHB'24 p.98, SRD 5.2, #1240) each
  // grant TWO menu entries — a free variant and a 1-Focus variant — rather
  // than the 2014 SRD's flat "always costs 1 ki" shape (both compete for the
  // same bonus action). Heightened Focus (monk L10, #1244) upgrades both
  // *Focus entries in place (heightened-focus.ts), never the free ones.
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
  // 2014 (SRD 5.1 / PHB'14 p.77): ONE row apiece, not the 2024 free/paid
  // pair — a flat 1-ki cost with no free variant. Distinct served keys from
  // the 2024 rows above (NOT `patientDefense`/`stepOfTheWind`): those exact
  // keys are pinned `serverEffect: false` in the frontend's ACTION_RESOLVERS
  // table (actionResolvers.ts) for the FREE 2024 variant, so a 2014 1-ki row
  // reusing either key would render but silently never spend.
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
  // Redirect rider: only meaningful once a ranged hit is reduced to 0 — a
  // "free" follow-up decision within the same reaction (mirrors Stunning
  // Strike's shape), not its own action-economy slot. Spends the persisted
  // Focus resource, unlike the free base reduction (the "Deflect Attacks"
  // row above).
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
  // Throw-back rider: a catch + ranged attack, not a save-forcing redirect,
  // so it's a real 1-ki spend (unlike the free base reduction above).
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
  // Empty Body's two independent ki-spend options (SRD 5.1 / PHB'14 p.79,
  // L18, #1500) — no server effect beyond the spend itself (no buff/
  // condition model for the astral-projection clause, and invisibility has
  // no target model to persist against). The base "Empty Body" feature-card
  // row above stays untouched; both action variants are actionOnly siblings.
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

// ---- Warrior of the Open Hand — SRD 5.2 p. 90 (#1501: tagged EDITION_2024,
// ---- bound to the "Warrior of the Open Hand" Subclass row's own retag in
// ---- the same commit — see subclasses.ts). Its 2014 counterpart, "Way of
// ---- the Open Hand" (SRD 5.1 p.78, the ONLY monastic tradition SRD 5.1
// ---- prints), is its own block below — a separate subclass, not a fork of
// ---- this one; the two share three feature NAMES but genuinely differ in
// ---- mechanics on all three (Open Hand Technique's Addle duration, Wholeness
// ---- of Body's cost/pool/formula, Quivering Palm's cost/damage/outcome
// ---- mapping) plus a fourth feature (Fleet Step / Tranquility) that has no
// ---- counterpart in the other edition at all — CLAUDE.md's #1430 "one
// ---- description can't cite two documents" precedent, same shape as the
// ---- base class's own forked rows.
const WARRIOR_OF_THE_OPEN_HAND_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Open Hand Technique",
    level: 3,
    edition: "EDITION_2024",
    // Addle corrected 2026-08 (#1501): SRD 5.2's actual text is "can't make
    // Opportunity Attacks until the start of its next turn" — narrower than
    // "take reactions" (this row's pre-#1501 wording) and DOES mean the
    // TARGET's own next turn ("its"), verified against the SRD 5.2 API text
    // directly rather than assumed from the pre-existing drift between this
    // row and the module-header comment #1501's issue flagged.
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
    // Row-driven action (#1912) — S, identity == pool: the pool ITSELF
    // still comes from monk.ts's own resourceFn (Wis-mod-dependent), so this
    // row sets no resourceTotals (poolFromRow requires them to mint a pool —
    // absent here, so this mints no phantom one).
    resourceKey: "wholenessOfBody",
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
    // Row-driven action (#1912) — P: not a discrete spend, just a rider
    // (like Reckless Attack/Metamagic's cost:"free" reminders).
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

// ---- Way of the Open Hand — SRD 5.1 p. 78 / PHB'14 p.78 (#1501) -----------
// Verified against dnd5eapi.co's 2014 feature text directly. Open Hand
// Technique's Addle duration is "until the end of YOUR next turn" (the
// monk's own next turn, no save) — genuinely longer than 2024's "until the
// start of ITS [the target's] next turn", not a wording variant of it.
// Quivering Palm's outcome mapping is INVERTED from 2024's (fail = drops to
// 0 HP outright, success = full 10d10 necrotic — never halved); transcribed
// as SRD 5.1 states it, not normalized to 2024's fail-full/success-half
// shape (#1501's issue note).
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
    // Row-owned pool (#1134's discriminator: a FIXED total needs no
    // ability-score-dependent resourceFn, unlike the 2024 sibling's Wis-mod
    // formula, which stays in monk.ts's own resourceFn).
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
    // Row-driven action (#1912) — P: a passive gained at the end of a long
    // rest, not a mid-turn spend (no resourceKey-gated cost).
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
  // Wholeness of Body needs its OWN served action identity
  // ("wholenessOfBodyAction", not the 2024 sibling's "wholenessOfBody")
  // because its shape genuinely differs — an action, not a bonus action,
  // healing a FLAT 3 x monk level with no die roll at all — mirrors
  // patientDefenseKi/stepOfTheWindKi's own same-feature-different-key
  // precedent above. It can't ride the "Wholeness of Body" row above
  // (#1912): that row's own `resourceKey` is already claimed by its
  // row-owned POOL identity ("wholenessOfBody", resourceTotals set two rows
  // up), and `@@unique([classId, subclassId, name, edition])` forbids a
  // second row named "Wholeness of Body" in this same partition — so this
  // is an actionOnly sibling under its own name, spending the SAME pool via
  // costPoolKey. `name` deliberately differs from the served action's own
  // "Wholeness of Body" name (a disclosed, unavoidable delta — see the
  // #1912 PR body).
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

// ---- Warrior of Shadow — 2024 rewrite (PHB'24 p.91, #1246) -----------------
// Shadow Arts drops the 2014 flat-2-focus/4-spell menu for a single 1-focus
// Darkness cast + passive Minor Illusion/Darkvision grants; Cloak of Shadows
// moves 11 -> 17 (replacing Opportunist, retired — no 2024 equivalent) and
// Improved Shadow Step fills the vacated L11 slot. Tagged EDITION_2024 (#1502
// — a real 2014 monk subclass, Way of Shadow, now exists under its OWN slug
// below, so this text is no longer a both-editions transcription).
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
    // Row-driven action (#1912) — P: no resourceKey-gated cost, no server
    // effect; reminder is the deliverable. Improved Shadow Step (L11) rider
    // is an announce-augmentor payload (improved-shadow-step.ts), never a
    // second row.
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
    // Row-driven action (#1912) — S, identity == pool.
    resourceKey: "cloakOfShadows",
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 3,
    reminder: "Magic action, entirely within dim light or darkness: spend 3 focus to become invisible and move through creatures/objects as difficult terrain for 1 minute (or until incapacitated, or you end your turn in bright light). Flurry of Blows costs no focus while it lasts.",
  },
  // "Shadow Arts" above stays a pure feature-text row — its served action
  // identity needs a DIFFERENT name ("Shadow Arts (Darkness)", the
  // pre-migration DERIVED_ACTIONS name, disambiguating it from Way of
  // Shadow's own 2014 "Shadow Arts" cast) — so it rides its own actionOnly
  // sibling rather than the text row (#1912: attaching to a differently-
  // named row would change the served action's `name`, an avoidable delta).
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

// ---- Way of Shadow — PHB'14 pp.79-80 (not in SRD 5.1, #1502) ---------------
// A materially different fork from the 2024 rewrite above, not a retab:
// Shadow Arts is a flat 4-spell 2-ki menu (the per-spell catalog rows live in
// shadow-arts.ts, not here — this row is the feature TEXT); Shadow Step
// grants no free unarmed strike and never upgrades (no Improved Shadow Step —
// that's 2024-only, filling the L11 slot THIS subclass uses for Cloak of
// Shadows instead); Cloak of Shadows costs no ki and has no duration cap
// beyond "until you attack, cast a spell, or are in bright light"; Opportunist
// (no 2024 counterpart — retired there in favor of Cloak of Shadows at L17)
// returns as its own L17 feature. DISTINCT subclassSlug from Warrior of
// Shadow above (monk-way-of-shadow, not monk-warrior-of-shadow) — the two
// lineages coexist per campaign (epic #1281), never merged or substring-
// matched (#1339).
const WAY_OF_SHADOW_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-way-of-shadow"),
    name: "Shadow Arts",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Starting when you choose this tradition at 3rd level, you can use your ki to duplicate the effects of certain spells. As an action, you can spend 2 ki points to cast darkness, darkvision, pass without trace, or silence, without providing material components. Additionally, you gain the minor illusion cantrip if you don't already know it (PHB'14 pp.79-80 — not in SRD 5.1).",
    // Row-driven action (#1912) — S, identity == pool.
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
    // Row-driven action (#1912) — P: no resourceKey-gated cost, no server
    // effect, never upgrades (no Improved Shadow Step in 2014).
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
    // Row-driven action (#1912) — P: no ki cost, no duration cap (unlike the
    // 2024 sibling's 3-focus/1-minute shape).
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
    // Row-driven action (#1912) — P: no 2024 equivalent (retired there in
    // favor of Cloak of Shadows).
    resourceKey: "opportunist",
    activationCost: "reaction",
    reminder: "When a creature within 5 ft of you is hit by an attack made by a creature other than you, use your reaction to make a melee attack against that creature.",
  },
];

// ---- Warrior of Mercy — PHB'24 p.92 (not in SRD 5.2, gap-fill content, #1248) --
// None of these features call for a saving throw: Hand of Harm/Hand of
// Healing/Hand of Ultimate Mercy are touch effects that land automatically
// (see hand-of-harm.ts / hand-of-ultimate-mercy.ts for the live-play
// automation of the two that spend Focus mid-combat; Hand of Healing runs
// through the generic actions.ts dispatch like Wholeness of Body). Implements
// of Mercy grants fixed (non-choice) proficiencies — like Disciplined
// Survivor's saving-throw proficiency above, it's feature text only; this
// app has no mechanism for a subclass to auto-add to the persisted skill/tool
// proficiency lists (those are chosen at creation).
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
    // Row-driven action (#1912) — S, identity == pool. Physician's Touch
    // (L6) upgrades this in place — an announce-augmentor payload
    // (physicians-touch.ts), never a second row. The Flurry-replacement
    // variant is its own actionOnly sibling below (no Focus cost of its
    // own, since Flurry already spent 1 Focus via its own action).
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
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Ultimate Mercy",
    level: 17,
    description:
      "As a Magic action, expend 5 focus to touch a creature that died no more than 24 hours ago and return it to life with 4d10 plus your Wisdom modifier hit points, ending the Blinded, Deafened, Paralyzed, Poisoned, and Stunned conditions on it. Usable once per long rest.",
  },
  // Flurry-replacement variant: swaps in for one of Flurry of Blows' own
  // unarmed strikes, so it costs no Focus of its own (Flurry already spent
  // its 1 Focus via the separate flurryOfBlows action) — hence no cost
  // columns. actionOnly (#1912): "Hand of Healing (Flurry replacement)" is
  // this variant's own served name, never a feature card of its own.
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

// ---- Warrior of the Elements — 2024 rebuild of Way of the Four Elements ----
// (PHB'24 p.90). Four fixed features (no chosen abilities): Manipulate
// Elements + Elemental Attunement at L3, Elemental Burst at L6, Stride of
// the Elements at L11, and the Elemental Epitome capstone at L17. Elemental
// Attunement is modeled as a while-active buff + two Focus-spending session
// actions (toggle + Elemental Burst) — see warrior-of-elements.ts. Every row
// tagged EDITION_2024 (#1503) — see the file header's note on why this
// subclass, unlike Open Hand/Shadow/Mercy, can't stay untagged/shared: its
// Subclass row forked the moment Way of the Four Elements (its real 2014
// predecessor) was authored with its own slug.
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
    // #1686: the TOGGLE half only — activating/ending the buff that gates
    // attunementActive() (warrior-of-elements.ts). Elemental Burst/Elemental
    // Strike's own damage-and-save mechanics stay in that file's dedicated
    // route (they're save-DC damage ops, not buffs). `resourceKey` here is
    // this toggle's own IDENTITY (activate key "elementalAttunement" / end
    // key "endElementalAttunement") — it has no resourceTotals of its own
    // because the ACTUAL spend is 1 use of the SHARED "focus" pool
    // (costPoolKey), not a dedicated per-feature pool. The marker-buff form
    // (modifier: 0, target === key) is state-tracking only: attunementActive()
    // reads the buff's PRESENCE, never its modifier value.
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
    // Row-driven action (#1912) — S, identity == pool. The save-DC damage op
    // itself stays in warrior-of-elements.ts's own endpoint (castElementalBurst).
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

// ---- Way of the Four Elements (2014-only, #1503) — PHB'14 pp. 78, 80-81, ---
// ---- not in SRD 5.1 ---------------------------------------------------------
// Disciple of the Elements (L3) is the mechanism feature: it names the
// ki-fueled discipline menu, the known-discipline progression (1/2/3/4 chosen
// disciplines at L3/6/11/17, i.e. 2/3/4/5 total with the always-known
// Elemental Attunement), and the learn-a-new/swap-one-known rule. The actual
// catalog is disciplines.ts (16 rows, source "discipline") plus
// monk.ts's `choices` declaration (#899) — this row is player-facing text
// only, no mechanics of its own. Elemental Attunement (also L3) is the one
// ALWAYS-known discipline (free, uncapped) — its own row here is flavor text;
// the reminder action + level gate are a DERIVED_ACTIONS row (actions.ts),
// matching every other monk subclass action (#1315).
const WAY_OF_THE_FOUR_ELEMENTS_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-way-of-the-four-elements"),
    name: "Disciple of the Elements",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You learn magical disciplines that harness the power of the four elements. You know Elemental Attunement plus one other elemental discipline of your choice, learning one more at 6th, 11th, and 17th level (2/3/4/5 known total). A discipline requires you to spend ki points each time you use it, and some disciplines require you to reach a specified monk level before you can use them. Whenever you learn a new elemental discipline, you can also replace one you already know with a different discipline. PHB'14 pp. 78, 80.",
  },
  {
    subclassSlug: slug("monk-way-of-the-four-elements"),
    name: "Elemental Attunement",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You always know this elemental discipline, and it doesn't count against the number of elemental disciplines you know. As an action, you can briefly control elemental forces within 30 ft of you, causing one of the following effects: create a harmless, sensory elemental effect; instantaneously light or snuff out a candle, torch, or small campfire; chill or warm up to 1 pound of nonliving material for up to 1 hour; or shape a small amount of nonliving earth, fire, water, or mist for up to 1 minute. PHB'14 p.80.",
    // Row-driven action (#1912) — P: free/uncapped, no resourceKey-gated
    // cost at all (unlike 2024's Focus-fuelled buff toggle — a materially
    // different feature, not a text variant of it).
    resourceKey: "elementalAttunement",
    activationCost: "action",
    reminder: "Briefly control elemental forces within 30 ft: create a harmless sensory effect; light or snuff a small flame; chill or warm up to 1 lb of nonliving material for 1 hour; or shape a small amount of nonliving earth, fire, water, or mist for 1 minute. Free — always known, no ki cost.",
  },
  // castDiscipline is a discoverability/gate tile only — no ACTION_EFFECT_FN
  // entry (the real cast is one ABILITY_REGISTRY entry, disciplines.ts,
  // dispatched through POST /api/characters/:id/abilities/disciplines/
  // transactions, not this table's generic action-execute path). actionOnly
  // (#1912): no "Elemental Discipline" feature-text row exists — "Disciple
  // of the Elements" above is the mechanism feature text, a different name.
  // Identity ≠ pool (both happen to be named "ki"-adjacent strings, but
  // resourceKey "castDiscipline" and costPoolKey "ki" are genuinely
  // different keys) — the disciplines.ts guard reads THIS row's own key.
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

// The full Monk seed family: base class (17 EDITION_2014 rows / 18
// EDITION_2024 rows, #1500) + Way of the Open Hand (4 EDITION_2014-only
// rows, #1501) + Warrior of the Open Hand (4 EDITION_2024-only rows, #1501)
// + Way of Shadow (4 EDITION_2014-only rows, #1502) + Warrior of Shadow (4
// EDITION_2024-only rows, #1502) + Warrior of Mercy (6 features, still
// shared/untagged — no 2014 fork exists yet) + Warrior of the Elements (5
// EDITION_2024-only rows, #1503's retag) + Way of the Four Elements (2
// EDITION_2014-only rows, #1503) = 33 EDITION_2014 + 37 EDITION_2024 = 70
// rows total (monk-2024-content.test.ts pins the per-partition counts
// exactly). Concatenated into class-features.ts's CLASS_FEATURES the same
// way every other literal class's export is.
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
