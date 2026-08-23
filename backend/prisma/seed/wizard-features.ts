// --- Wizard ClassFeature rows, authored as LITERAL data (#1234) ------------
// Mirrors Barbarian's #1223, itself modelled on Fighter's pilot
// (#1227/#1528/#1532), across four commits:
//
// 1. Moved these rows off lib/classes/wizard.ts's AuthoredFeature[] arrays
//    into literal seed data, byte-identical to the old TS-derived text
//    (pinned by wizard-2014-snapshot.test.ts).
// 2. Authored Wizard's REAL SRD 5.2 (2024) content. The base class and Evoker
//    are transcribed from the SRD 5.2 / SRD 5.2.1 CC-BY document
//    (dndbeyond.com/srd), cross-checked against two independent mirrors (a
//    5etools-mirror-3 XPHB data extract and dnd2024.wikidot.com) which agree
//    verbatim. Abjurer and Illusionist aren't in SRD 5.2 at all, so their
//    2024 text is mirror-sourced from those same two independently-agreeing
//    sources — see each row's own citation.
// 3. Moved Arcane Recovery's and Illusory Self's resource pools onto their
//    rows (see the RESOURCE POOL block below) and deleted
//    lib/classes/wizard.ts's two resourceFns, nothing depending on them.
// 4. Reduced lib/classes/wizard.ts to its irreducible residue: its
//    `grantLevel: 2` on every subclass was PHB'14's actual Arcane Tradition
//    gate, and `subclassGateLevel`'s undefined-grantLevel fallback is 3, so
//    deleting the module at that point would have silently moved every 2014
//    Wizard's subclass gate. #1576's seeded CharacterClass.subclassLevel
//    later gave isSubclassActive a data source that survives a module's
//    deletion — that tracked follow-up is what let lib/classes/wizard.ts be
//    deleted outright too; ClassFeatureRowsCarrier.subclassLevel's own doc
//    comment has the mechanism.
// class-features.ts concatenates WIZARD_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors fighter-features.ts/barbarian-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text —
// reserved for the handful of features that are genuinely edition-invariant
// in both mechanics AND wording. No Wizard feature qualifies for that
// shortcut (CLAUDE.md's ACTIONS precedent: every surviving name's text below
// is transcribed from a different document per edition), so every row is
// tagged starting this commit. A "removed in 2024" feature means NOT
// authoring a 2024 row for that name, never deleting the 2014 row, and a
// level-shift is two rows with two `level` values, never one row edited in
// place. Every EDITION_2014 row below stays byte-identical to what commit 1
// pinned (wizard-2014-snapshot.test.ts) — this commit only ever ADDS an
// `edition: "EDITION_2024"` tag alongside new 2024 text; it never edits a
// 2014 row's own name/level/description.
//
// RESOURCE POOL (commit 3 of 4, mirrors Barbarian's #1223 two-step): Arcane
// Recovery's uses-per-rest total/recharge (both editions: flat total 1,
// longRest) and Illusory Self's (both editions: flat total 1 from level 10,
// short-or-long) now live on their rows' resourceKey/resourceLabel/
// resourceRecharge/resourceTotals below, replacing lib/classes/wizard.ts's
// two resourceFns, which this same commit deletes. #1528's "no-second-string"
// rule (poolFromRow reads the row's own `description`, never a second
// hand-written pool string) means the retired resourceFns' synthetic
// "Regained on a long rest."/"Regain use on a short or long rest." sentences
// are gone from the wire — an accepted, intended consequence, not a
// regression to fix. Illusory Self's row `level: 10` IS the gate the retired
// resourceFn used to express as `if (level < 10) return []` — reproduced
// exactly via `resourceTotals: [{ minLevel: 10, total: 1 }]`. Neither pool
// gets a `shortRestRegain` on any tier — Arcane Recovery is long-rest-only in
// both editions, and Illusory Self's 2024 slot-expend restore is a
// player-initiated cost, not a rest regain, so it has no descriptor column
// and stays text-only (see that row's own comment).
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type {
  ActivationRequirement,
  EffectBuffRow,
  ResourceTotalFormula,
} from "../../src/lib/classes/class-feature-rows.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors fighter-features.ts's/
// barbarian-features.ts's own slug()).
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
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // Resource-pool descriptor columns (#1234 commit 3, widened #1676 to
  // fighter-features.ts's field set) — see this file's own header RESOURCE
  // POOL block for why only Arcane Recovery's/Illusory Self's/Bladesong's
  // rows below ever set these. `total: ResourceTotalFormula` (#1685) widens
  // past the original flat-number-only shape — Bladesong's PB-per-long-rest
  // pool is the first Wizard consumer of the formula form.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  // fallow-ignore-next-line code-duplication -- same intentional per-class-file mirror as the comment two fields up (fighter-features.ts's own resourceTotals..saveDcAbilities block)
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  // Activation/cost/effect + derived-stat descriptor columns (#1528/#1530),
  // widened onto Wizard by #1676 (Bladesinger — the first Wizard row to need
  // them: Bladesong's toggle, Song of Defense's slot-cost reaction, Extra
  // Attack's derivedStat). Fighter's field set is the template
  // (fighter-features.ts); saveDcAbilities rides along for parity even
  // though no Wizard row sets it yet.
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
  // Bladesinger-specific vocabulary (#1676) — past fighter-features.ts's own
  // field set, since Fighter's #1528/#1530 retab never needed a while-active
  // buff, an activation gate, or a passive grant. effectBuffs (#1686):
  // Bladesong's AC/speed/melee-damage buffs. activationRequires (#1688):
  // Bladesong's armor gate, Song of Defense's requiresActiveBuff. improvements
  // (#1691): Training in War and Song's light-armor/Performance grant.
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

// ---- Base class — PHB'14 p.114 (2014) / SRD 5.2 (2024) --------------------
// 2014: 4 rows, byte-identical to wizard-2014-snapshot.test.ts. 2024: 8
// rows — Ritual Adept (L1), Scholar (L2), Memorize Spell (L5), and Epic Boon
// (L19) are wholly new; Spellcasting, Arcane Recovery, Spell Mastery, and
// Signature Spells all carry real SRD 5.2 text. Signature Spells' 2024 text
// carries NO "casting time of an action" restriction on the two chosen
// spells — that restriction exists only on Spell Mastery's L1/L2 picks
// (checked against the document; a stale candidate bullet from planning
// claimed otherwise and is not authored here).
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
    // SRD 5.2: the Prepared Spells count is now a flat table (the Wizard
    // Features table), not an Intelligence-modifier formula — out of scope
    // here (lib/srd/spellcasting-tables.ts; #1513 is the separate, already-
    // filed bug about the level-1 spellbook count and isn't touched by this
    // issue). You know three cantrips (four at level 4, five at level 10) and
    // your spellbook starts with six 1st-level spells, gaining two more per
    // level after 1st.
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
    // #1234 commit 3: reproduces the retired resourceFn's pool exactly —
    // flat total 1, longRest recharge (#904). The slot-level cap itself is
    // computed at op time (resolveArcaneRecoveryContext,
    // lib/spellcasting/spellcasting.ts), not a tier.
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
    // SRD 5.2: genuinely the SAME mechanic as 2014 (once per Long Rest, when
    // finishing a Short Rest, recover slots totalling up to half your Wizard
    // level rounded up, none 6th level or higher) — transcribed from a
    // different document, which forks even where the rule agrees (CLAUDE.md's
    // ACTIONS precedent).
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
    // #1588: 1 pick at L2. The six-skill restriction this description states
    // is NOT enforced by the expertiseKnown pick validator — the pick cap is
    // per-character (shared across every grantor), not a per-feature allowed-
    // skill list, so a Wizard can pick expertise in any skill they're
    // proficient in (over-permissive relative to RAW, disclosed rather than
    // silently narrower).
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
    // SRD 5.2: restricts both picks to spells with a casting time of an
    // action (verified against the document — the 2014 row carries no such
    // restriction) and requires a full Long Rest, not 8 hours, to change them.
    description:
      "Choose a 1st-level and a 2nd-level spell in your spellbook, each with a casting time of an action. You always have both prepared, and you can cast each at its lowest level without expending a spell slot — casting at a higher level still costs a slot. Whenever you finish a Long Rest, you can study your spellbook and replace either choice with an eligible spell of the same level.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart (2014 keeps a plain ASI at
    // 19 instead, already covered by the edition-invariant ASI-level table,
    // not a ClassFeature row). Mirrors Fighter's/Barbarian's own Epic Boon
    // rows (#1227/#1223); the feat system itself is deferred — text only.
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
    // SRD 5.2: verified against the document — NO "casting time of an
    // action" restriction on these two picks (that restriction belongs only
    // to Spell Mastery above; a planning-stage candidate bullet claiming
    // otherwise does not appear in the actual text and is not authored here).
    description:
      "Choose two 3rd-level spells in your spellbook as your signature spells. You always have them prepared, and you can cast each once at 3rd level without expending a spell slot. To cast either at a higher level, you must expend a spell slot; regain both uses after a Short Rest or Long Rest.",
  },
];

// ---- School of Evocation -> Evoker — SRD 5.2 (2024). PHB'14 p.117 (2014) ---
// 2014: 5 rows. 2024: 5 rows, same five names throughout (Evocation Savant/
// Potent Cantrip level-shift 2/6 -> 3; Sculpt Spells level-shifts 2 -> 6;
// Empowered Evocation/Overchannel stay at their 2014 levels but still carry
// their own 2024 text, transcribed from a different document, per CLAUDE.md's
// ACTIONS precedent). SRD 5.2 ships exactly one subclass per class — Wizard's
// is Evoker — so this content is sourced directly from the SRD 5.2 document,
// cross-checked against the same two independent mirrors as the base class.
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
    // SRD 5.2: drops the halved-copy-cost mechanic entirely — replaced by two
    // free Evocation spells (level <=2) added to the spellbook at 3rd level,
    // then one further free Evocation spell whenever a new spell-slot level
    // is reached (verified against the document; present in both independent
    // mirrors, not just the L3 two-spell grant).
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
    // SRD 5.2: level-shifts 6 -> 3, and now ALSO triggers on a missed attack
    // roll (not just a successful save) — verified against the document.
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
    // SRD 5.2: the necrotic cost is 2d12 per spell level on the FIRST
    // additional use, then rises by a further 1d12 per spell level on each
    // use after that — the 2014 row's flat "2d12 per spell level" every time
    // is a genuine mechanical difference, not just wording.
    description:
      "When you cast a Wizard spell with a spell slot of levels 1-5 that deals damage, you can deal maximum damage with it. The first time you do this before finishing a Long Rest, you suffer no adverse effect. Each further time before that Long Rest, you take 2d12 Necrotic damage for each level of the spell slot, and that damage per spell level increases by 1d12 for each additional use — this damage ignores Resistance and Immunity.",
  },
];

// ---- School of Abjuration -> Abjurer — PHB'24 (mirror-sourced; not in SRD --
// ---- 5.2). 2014: PHB'14 p.116. --------------------------------------------
// 2014: 5 rows. 2024: 5 rows (same total, different names) — Improved
// Abjuration has no 2024 successor (removed, not deleted — its 2014 row
// stays); Spell Breaker fills its L10 slot instead, so the row COUNT matches
// while the NAME set doesn't. Mirrors: a 5etools-mirror-3 XPHB data extract
// and dnd2024.wikidot.com/wizard:abjurer agree verbatim on every row below —
// the owner's two-independent-mirrors bar (#1234) is met.
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Drops the halved-copy-cost
    // mechanic for the same free-spells shape as Evocation Savant above.
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Level-shifts 2 -> 3; states
    // explicitly that your own Resistances/Vulnerabilities apply BEFORE the
    // ward's HP is reduced (the 2014 row is silent on ordering); the ward can
    // also be recharged as a Bonus Action by expending a spell slot outright,
    // not only by casting an Abjuration spell.
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Same resistance-before-ward-HP
    // ordering correction as Arcane Ward above.
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
  // Improved Abjuration has NO EDITION_2024 row — removed in 2024 (Spell
  // Breaker, below, fills its L10 slot instead). "Removed in 2024" means not
  // authoring a 2024 row for this name, never deleting the 2014 row above.
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Spell Breaker",
    level: 10,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). NEW in 2024 — no 2014
    // counterpart. Fills Improved Abjuration's L10 slot with a wholly
    // different mechanic (always-prepared counterspelling, not an ability-
    // check bonus). Counterspell/Dispel Magic being always-prepared spells
    // can't be modelled as a SubclassGrantedSpell row — that model has no
    // `edition` column and Subclass rows are edition-shared, so a grant row
    // would leak the spells to 2014 Abjurers too (a schema gap, not a scope
    // choice) — text only here.
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

// ---- School of Illusion -> Illusionist — PHB'24 (mirror-sourced; not in ----
// ---- SRD 5.2). 2014: PHB'14 p.117. -----------------------------------------
// 2014: 5 rows. 2024: 5 rows — Improved Minor Illusion is RENAMED Improved
// Illusions (a different name at the same shifted level, never a same-named
// pair) and Malleable Illusions has no 2024 successor (Phantasmal Creatures
// fills its L6 slot with a wholly different mechanic instead). Mirrors: a
// 5etools-mirror-3 XPHB data extract and dnd2024.wikidot.com/wizard:illusionist
// agree verbatim on every row below.
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Same free-spells shape as
    // Evocation/Abjuration Savant above.
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
  // Improved Minor Illusion has NO EDITION_2024 row under this name — the
  // 2024 successor is a DIFFERENT name (Improved Illusions, below), never a
  // same-named tagged pair, per this file's own header rule on renames.
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Improved Illusions",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). Renamed from Improved Minor
    // Illusion, level-shifted 2 -> 3, and widened: drops the Verbal-component
    // requirement on Illusion spells generally (verified present in both
    // mirrors, not merely a secondary-source claim) and extends the range of
    // any Illusion spell with a 10+ foot range by 60 feet, alongside the
    // original sound+image/known-cantrip/Bonus-Action Minor Illusion grant.
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
  // Malleable Illusions has NO EDITION_2024 row — removed in 2024
  // (Phantasmal Creatures, below, fills its L6 slot instead).
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Phantasmal Creatures",
    level: 6,
    edition: "EDITION_2024",
    // PHB'24 (mirror-sourced; not in SRD 5.2). NEW in 2024 — no 2014
    // counterpart. Same schema gap as Abjurer's Spell Breaker above: the
    // always-prepared Summon Beast/Summon Fey grant can't be a
    // SubclassGrantedSpell row (no `edition` column, edition-shared Subclass
    // row) — text only here.
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
    // #1234 commit 3: reproduces the retired resourceFn's
    // `if (level < 10) return []` gate exactly, as row data — `level: 10` on
    // THIS row is the gate; `resourceTotals`' own `minLevel: 10` restates it
    // for poolsFromRows, which reads tiers independent of the row's own
    // `level` filter (both must agree; see class-feature-rows.ts).
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Adds a second recharge path:
    // expending a level 2+ spell slot (no action required) restores the use
    // early, alongside the unchanged short-or-long-rest recharge. The
    // slot-expend restore has no descriptor column (a player-initiated cost,
    // not a rest regain) — stays text-only, per the file header.
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
    // PHB'24 (mirror-sourced; not in SRD 5.2). Mechanic unchanged; the object
    // can now be made real as a Bonus Action while the spell is ongoing
    // (2014 is silent on timing beyond casting the spell).
    description:
      "When you cast an Illusion spell with a spell slot, you can make one inanimate, nonmagical object that's part of the illusion real for 1 minute — usable as a Bonus Action while the spell is ongoing. The object can't deal damage or otherwise cause harm.",
  },
];

// ---- Bladesinging — TCoE (Tasha's Cauldron of Everything) p. 76 (2014) ----
// EDITION_2014 only — no SRD 5.2/PHB'24 printing exists (out of scope, epic
// #1281); `crossEditionRejection` + the tagged Subclass row (subclasses.ts)
// are the whole 2024 story (a 2024 wizard picking this slug 400s). All-seed-
// row: the #1685-#1691 F1-F5 engine rungs (formula pool totals, row-declared
// effectBuffs + generic toggle resolver, slot-shaped ability costs,
// declarative activationRequires + equip-driven clearing, passive
// improvements) express every mechanic below with ZERO new
// ACTION_EFFECT_FN/resourceFn/hand-written gate — Bladesinger is their first
// content consumer (#1676).
const BLADESINGING_SLUG = slug("wizard-bladesinging");

// Shared by every effectBuffs entry below (#1688) — Bladesong can't be
// activated in medium/heavy armor or with a shield, and ends early if you
// don any of the three (light armor is deliberately absent from both lists —
// TCoE's whole point is that light armor doesn't interfere).
const BLADESONG_ARMOR_GATE = ["noMediumArmor", "noHeavyArmor", "noShield"] as const;
const BLADESONG_CLEAR_ON = ["equipMediumArmor", "equipHeavyArmor", "equipShield"] as const;

const BLADESINGING_RAW: RawWizardFeature[] = [
  {
    subclassSlug: BLADESINGING_SLUG,
    name: "Training in War and Song",
    level: 2,
    edition: "EDITION_2014",
    // TCoE p. 76.
    description:
      "You gain proficiency with light armor, one type of one-handed melee weapon of your choice, and the Performance skill.",
    // #1691: the light-armor/Performance grants are DERIVED via improvements
    // (the fixed half of the trait); the one-handed-weapon TYPE choice has no
    // subclass-choice machinery to back it (decision 6) — announce-only, the
    // description above carries the instruction.
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
    // TCoE p. 76. Announce-only riders folded into this description rather
    // than a second row (decision 5, #1676): the Acrobatics/concentration
    // bonuses have no skill-granular/concentration-bonus axis to ride, and
    // the 1-minute/incapacitated/two-handed-attack end conditions are
    // reminder text (endReminder below), not a turn-hook predicate — Rage's
    // own precedent for what stays announce-only. Song of Victory (L14) is
    // folded in too rather than its own row — it rides this SAME toggle via
    // a level-gated effectBuffs entry (#1686's motivating case), mirroring
    // how Rage's 2014 row states its L9/L16 damage tiers in one row's text.
    description:
      "As a bonus action, weave a Bladesong that lasts 1 minute. While it lasts, you gain a bonus to your AC equal to your Intelligence modifier (minimum +1), your walking speed increases by 10 feet, you have advantage on Dexterity (Acrobatics) checks, and you gain a bonus to concentration checks equal to your Intelligence modifier (minimum +1). You have a number of uses of this feature equal to your proficiency bonus, regained on a long rest. You can't activate Bladesong while wearing medium or heavy armor or wielding a shield. At 14th level (Song of Victory), while your Bladesong is active you also add your Intelligence modifier to your melee weapon damage rolls.",
    resourceKey: "bladesong",
    resourceLabel: "Bladesong",
    resourceRecharge: "longRest",
    // #1685: proficiency-bonus uses per long rest — TCoE's own number, not a
    // flat/tiered count.
    resourceTotals: [{ minLevel: 2, total: "proficiencyBonus" }],
    activationCost: "bonusAction",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "bladesong",
    costBase: 1,
    // #1688: the armor/shield activation gate — light armor is deliberately
    // absent (TCoE's whole point).
    activationRequires: [...BLADESONG_ARMOR_GATE],
    // #1686: three separate ActiveBuff entries (AC/speed/melee-damage) — one
    // ActiveBuff carries exactly one target/modifier pair, so a 3-target
    // toggle needs 3 entries. appendActiveBuffInTx dedupes by `key` on
    // apply/replace, so each entry needs its OWN key — only the AC entry
    // uses the row's identity key ("bladesong") itself, which is what
    // Song of Defense's `requiresActiveBuff: "bladesong"` gate below actually
    // checks for (activeBuffKeys is a set of every active buff's key, so one
    // matching entry is sufficient; it doesn't need every entry to share it).
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
        // Song of Victory (L14) — same toggle, level-gated entry (#1686's
        // motivating case): absent below level 14, present without a second
        // activation once reached.
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
    // TCoE p. 76: the cantrip-substitution rider is TCoE-only (absent from
    // the SCAG printing, decision 1) — announce text, no cantrip-swap
    // machinery exists.
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
    // TCoE p. 76. The 5x-slot-level damage reduction is announce-only
    // (decision 5, #1676 — no damage-reduction machinery exists); the player
    // applies the number the slot-level picker (frontend) interpolates.
    description:
      "While your Bladesong is active, you can use your reaction when you take damage to expend a spell slot and reduce that damage to yourself by 5 times the slot's level.",
    activationCost: "reaction",
    // #1687: costKind "slot" — no dedicated resource pool, so resourceKey
    // here is a pure action-key IDENTITY (mirrors toggleActionsFromRow's own
    // "resourceKey is this row's identity, not necessarily its pool" rule),
    // never a poolsFromRows consumer (no resourceTotals set, so no pool is
    // synthesized). effectKind "utility" (no dice) is what routes this row
    // through castAbilityWithSlotInTx rather than applyRowDrivenActionInTx's
    // pure-counter branch, which would otherwise try to spend "songOfDefense"
    // as a nonexistent pool.
    resourceKey: "songOfDefense",
    resolverKind: "slot-picker",
    costKind: "slot",
    costBase: 1,
    effectKind: "utility",
    // #1688: gated on Bladesong being active — TCoE's own "while your
    // Bladesong is active" (decision 7). Named by Bladesong's own buff key
    // above, not this row's resourceKey.
    activationRequires: [{ requiresActiveBuff: "bladesong" }],
  },
];

export const WIZARD_FEATURES: ClassFeatureSeedRow[] = [...WIZARD_BASE_RAW, ...EVOCATION_RAW, ...ABJURATION_RAW, ...ILLUSION_RAW, ...BLADESINGING_RAW].flatMap(expand);
