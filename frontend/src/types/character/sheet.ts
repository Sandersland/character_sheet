/**
 * The aggregate serialized Character shape and its lean summary view.
 */

import type { AttackRow, DiceRider, RulesEdition, SaveRider } from "@character-sheet/shared-types";

import type { AvailableAction } from "./actions";
import type { CampaignPreferences } from "./campaign";
import type { ArmorProficiency, CharacterResources, ClassEntry, ToolProficiency, WeaponProficiency } from "./classes";
import type { ActiveEffectsState, ArmorClassPart, ConditionsState, DerivedAttack, DerivedImprovisedAttack, RollModifier } from "./combat";
import type { InventoryItem, ItemAdvantageGrant, ItemConditionImmunity, ItemDamageTrait, ItemProficiencyGrant } from "./inventory";
import type { JournalEntry } from "./journal";
import type { AdvancementEntry, AdvancementSlots } from "./leveling";
import type { AbilityName, AbilityScores, Currency, Skill } from "./primitives";
import type { Spell, SpellSlots } from "./spells";

/** One species/variant-granted trait (#1682) — cited text, no arithmetic. */
export interface SpeciesTrait {
  name: string;
  description: string;
}

/**
 * Shape of character data returned by `GET /api/characters` and
 * `GET /api/characters/:id`. `level`/`proficiencyBonus`/threshold fields
 * are derived server-side from `experiencePoints` (via `levelForExperience`)
 * and never set directly by the client.
 */
export interface Character {
  id: string;
  /** Owning user id (backend-emitted). */
  ownerId: string;
  name: string;
  race: string;
  class: string;
  subclass?: string;
  subclassId?: string;
  level: number;
  experiencePoints: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number | null;
  /** Number of level-ups pending (XP-derived level exceeds applied hitDice.total). */
  pendingLevelUps: number;
  background: string;
  alignment: string;
  portraitUrl?: string;

  armorClass: number;
  /** Ordered labeled parts summing exactly to armorClass (backend-derived). */
  armorClassBreakdown: ArmorClassPart[];
  initiativeBonus: number;
  speed: number;
  proficiencyBonus: number;

  hitPoints: {
    current: number;
    max: number;
    temp: number;
    deathSaves: { successes: number; failures: number };
  };
  hitDice: {
    total: number;
    die: string; // e.g. "d10"
    spent: number;
  };

  abilityScores: AbilityScores;
  savingThrowProficiencies: AbilityName[];
  skills: Skill[];
  /** Merged tool proficiencies — creation-fixed (background/class/race) and
   *  level-gated subclass choices (e.g. Student of War), deduped by name. */
  toolProficiencies: ToolProficiency[];
  /** Armor proficiencies derived at read time from class, race, and feats. */
  armorProficiencies: ArmorProficiency[];
  /** Weapon proficiencies derived at read time from class, race, and feats.
   *  Entries are either category-level ("Simple Weapons") or specific ("Longswords"). */
  weaponProficiencies: WeaponProficiency[];

  inventory: InventoryItem[];
  currency: Currency;
  /** Carrying capacity in lb, derived server-side from the effective STR score (#1377). */
  carryCapacity: number;
  /** Carried weight in lb — the pack plus the purse, derived server-side (#1377). */
  carriedWeight: number;
  /** The attunement cap the server's attune path rejects past (#1377). */
  attunementCap: number;

  spellcasting?: {
    ability: AbilityName;
    spellSaveDC: number;
    spellAttackBonus: number;
    slots: SpellSlots[];
    /**
     * Warlock Mystic Arcanum — one free cast per long rest of a spell at each
     * listed level (6th–9th). Empty/absent for every other caster.
     */
    arcana?: SpellSlots[];
    /**
     * Warlock Pact Magic in a multiclass character — kept out of the merged slot
     * pool (PHB p. 164). Null/absent for single-class casters (whose pact slots
     * live in `slots`) and multiclass characters with no warlock levels.
     */
    pact?: {
      slotLevel: number;
      count: number;
      used: number;
      spellSaveDC: number;
      spellAttackBonus: number;
    } | null;
    /** Per-class caster stats — present only for multiclass characters. */
    classes?: {
      className: string;
      subclass: string | null;
      ability: AbilityName;
      spellSaveDC: number;
      spellAttackBonus: number;
      casterFraction: "full" | "half" | "third" | "pact" | "none";
    }[];
    spells: Spell[];
    /** Derived prepared-spell cap (#883): the limit and current prepared count. */
    preparedSpellLimit?: number | null;
    preparedSpellCount?: number;
    /**
     * Whether this character's chosen spells are immediately castable ("known",
     * SRD 5.1 Bard/Sorcerer/Warlock/Ranger/EK/AT) or must be prepared from a
     * wider list ("prepared", every SRD 5.2 caster). Absent for a non-caster.
     * Served by buildSpellcastingView (#1507).
     */
    casterModel?: "known" | "prepared";
    /**
     * The noun for the meter/roster (e.g. "Prepared" / "Spells known") and the
     * locked-rune tooltip word (e.g. "Always prepared" / "Known"), served
     * alongside casterModel (#1511 D4) — the client renders these verbatim and
     * never composes known-vs-prepared copy itself. Both absent exactly when
     * casterModel is.
     */
    preparedLabel?: string;
    alwaysAvailableLabel?: string;
    /**
     * The spell the character is currently concentrating on (5e: only one at a
     * time), or null. `entryId` matches a `Spell.id` in `spells`.
     */
    concentratingOn?: { entryId: string; spellName: string } | null;
  };

  resources?: CharacterResources;

  /**
   * Active status conditions + exhaustion level. Always present (normalized on
   * read server-side). Mutate via applyConditionTransactions, never PATCH.
   */
  conditions: ConditionsState;
  /**
   * Display text for the CURRENT exhaustion level, resolved server-side for
   * this character's edition (#1322) — never author this text client-side; a
   * frontend-authored sentence is what let a 2014 character show 2024 text.
   */
  exhaustionEffectText: string;
  /**
   * Active cast-granted passive modifiers (buffs). Always present (normalized on
   * read). Each is also summed into its target skill/stat's tempModifier.
   */
  activeEffects: ActiveEffectsState;
  /**
   * State-driven advantage/disadvantage grants (#486), derived from active
   * conditions + buffs. Resolved per roll via `resolveRollMode`. Always present.
   */
  rollModifiers: RollModifier[];

  // Item-granted traits (#529), derived from active items. resistances also feed
  // the #456 auto-halve at damage-apply; all render as item-sourced sheet flags.
  resistances?: ItemDamageTrait[];
  damageImmunities?: ItemDamageTrait[];
  conditionImmunities?: ItemConditionImmunity[];
  grantedAdvantages?: ItemAdvantageGrant[];
  grantedProficiencies?: ItemProficiencyGrant[];

  /**
   * Derived available actions for the current turn — filtered by class/level/
   * resource availability. Lean display objects; see `AvailableAction`.
   * Undefined for characters without a class (shouldn't occur in practice).
   */
  availableActions?: AvailableAction[];

  /** Derived unarmed-strike stats — attack bonus and damage always available
   *  since everyone is proficient with unarmed strikes in 5e. Damage faces
   *  start at 1 (flat 1 + STR mod) and are raised to d4 by Tavern Brawler. */
  unarmedStrike: DerivedAttack;
  /** Derived improvised-weapon stats — 1d4 + STR, always shown. `proficient`
   *  is true only when "Improvised Weapons" appears in weaponProficiencies
   *  (e.g. via Tavern Brawler), which adds proficiency bonus to attackBonus. */
  improvisedWeapon: DerivedImprovisedAttack;

  /** Every way this character can swing, fully resolved server-side (#1434) — see
   *  `AttackRow`. REQUIRED, not optional: it is always served, and optional would
   *  let a fixture omit it and silently render an empty attack picker. */
  attackRows: AttackRow[];

  /** Weapon attacks per Attack action (Extra Attack), max across multiclass. */
  attacksPerAction: number;

  /** Server-resolved (#1120): the natural-d20 threshold a weapon attack crits
   *  on — 20 by default, widened by Champion's Improved/Superior Critical
   *  (19, then 18). Edition-invariant on the backend, so this field carries
   *  no edition branch on the wire either; the attack sheet compares a kept
   *  d20 against it instead of a hardcoded 20. */
  critRange: number;

  /** Server-resolved (#1433): a two-handed weapon in MAIN_HAND locks OFF_HAND, so
   *  nothing may occupy it. A property of the whole loadout, hence one boolean
   *  rather than a per-item flag. Distinct from the backend-internal "off-hand
   *  busy" notion (shield or second weapon) that only picks a versatile die. */
  offHandLocked: boolean;

  /** Rogue Sneak Attack Nd6, absent for a non-rogue. See the `Rider` type. */
  sneakAttack?: DiceRider;

  /** Monk Stunning Strike focus save DC, absent below monk L5 (#1242). */
  stunningStrike?: SaveRider;

  /** Open Hand Technique's ki/focus save DC (Push/Topple) — Warrior of the
   *  Open Hand (2024) or Way of the Open Hand (2014, #1501), absent below
   *  monk L3 off-subclass (#1245). Addle carries no save. */
  openHandTechnique?: SaveRider;
  /** Quivering Palm — ki/focus save DC + whether vibrations are currently
   *  set, absent below monk L17 off-subclass (#1245). Granted by either
   *  edition's Open Hand subclass (#1501). */
  quiveringPalm?: SaveRider;
  /** Battle Master maneuver save DC (#1316) — folded into the rider contract,
   *  named for the feature like every other rider; absent for non-Battle-
   *  Masters. maneuverChoiceCount/toolProfChoiceCount stay on `resources`
   *  (they're choice counts, not save DCs). */
  maneuvers?: SaveRider;

  /** Taken ASI / feat entries, in the order chosen (clamped to advancementSlots.total). */
  advancements: AdvancementEntry[];
  /** How many advancement slots this character has earned at their level. */
  advancementSlots: AdvancementSlots;
  /** Fighting Style feat slots (#1137): a partition separate from ASI slots. */
  fightingStyleSlots: AdvancementSlots;

  classes?: ClassEntry[];

  /** Species-granted information (#1682): name + cited text for the character's
   *  own species/variant selection (SpeciesTrait rows, resolved server-side).
   *  Announce-only cited text — darkvision included (owner ruling: visible
   *  info, not a derived combat stat) — the numbers a trait DOES derive
   *  (Dwarven Toughness's maxHp, weapon/armor training) already fold into
   *  hitPoints/armorProficiencies/weaponProficiencies above; this array is
   *  never itself a source of arithmetic on the client. [] for a legacy
   *  `race`-name-only character with no species picked yet. */
  speciesTraits: SpeciesTrait[];

  journal: JournalEntry[];

  /** Shared-campaign link (#246), or undefined when the character isn't in one. */
  campaignId?: string;
  /** Per-campaign play preferences (#537); absent when not in a campaign. */
  campaignPreferences?: CampaignPreferences;
  /** Authoritative rules edition for this sheet (#1285); write-once at creation. */
  rulesEdition: RulesEdition;
  /** The edition's display label, resolved server-side (#1436). REQUIRED, not
   *  optional: it is always served, and optional would let a fixture omit it and
   *  the badge silently render empty. */
  rulesEditionLabel: string;
}

export interface CharacterSummary {
  id: string;
  /** Owning user id (backend-emitted). */
  ownerId: string;
  name: string;
  race: string;
  class: string;
  /** All class entries (name + per-class level) for a multiclass card line. */
  classes?: { name: string; level: number }[];
  level: number;
  portraitUrl?: string;
  /** Shared-campaign link (#246), or undefined when the character isn't in one. */
  campaignId?: string;
}
