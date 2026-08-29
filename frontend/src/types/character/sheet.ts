import type { AttackRow, DiceRider, RulesEdition, SaveRider } from "@character-sheet/shared-types";

import type { AvailableAction } from "./actions";
import type { CampaignPreferences } from "./campaign";
import type { ArmorProficiency, CharacterResources, ClassEntry, ToolProficiency, WeaponProficiency } from "./classes";
import type { ActiveEffectsState, ArmorClassPart, ConditionKey, ConditionsState, DerivedAttack, DerivedImprovisedAttack, RollModifier } from "./combat";
import type { InventoryItem, ItemAdvantageGrant, ItemConditionImmunity, ItemDamageTrait, ItemProficiencyGrant } from "./inventory";
import type { JournalEntry } from "./journal";
import type { AdvancementEntry, AdvancementSlots } from "./leveling";
import type { AbilityName, AbilityScores, Currency, Skill } from "./primitives";
import type { Spell, SpellSlots } from "./spells";

/** Cited text, no arithmetic. */
export interface SpeciesTrait {
  name: string;
  description: string;
}

/** `level`/`proficiencyBonus`/threshold fields are derived server-side from `experiencePoints` via `levelForExperience`; never set directly by the client. */
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
  /** 2014 only (PHB'14 p.107), present only while unarmored at Draconic L14; the 2024 Dragon Wings (PHB'24 p.148) is a flat 60 ft activated ability on its own resource pool, not this derived value. */
  flySpeed?: number;
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
  /** Merged, deduped by name: creation-fixed (background/class/race) plus level-gated subclass choices. */
  toolProficiencies: ToolProficiency[];
  /** Armor proficiencies derived at read time from class, race, and feats. */
  armorProficiencies: ArmorProficiency[];
  /** Derived at read time from class, race, and feats; entries are either category-level or specific. */
  weaponProficiencies: WeaponProficiency[];

  inventory: InventoryItem[];
  currency: Currency;
  /** Carrying capacity in lb, derived server-side from the effective STR score. */
  carryCapacity: number;
  /** Carried weight in lb — the pack plus the purse, derived server-side. */
  carriedWeight: number;
  /** The attunement cap the server's attune path rejects past. */
  attunementCap: number;
  /** Eldritch Knight Weapon Bond's 2-weapon cap the server's bond path rejects past. */
  weaponBondCap: number;

  spellcasting?: {
    ability: AbilityName;
    spellSaveDC: number;
    spellAttackBonus: number;
    slots: SpellSlots[];
    /** Warlock Mystic Arcanum: one free cast per long rest at each listed level; empty/absent for every other caster. */
    arcana?: SpellSlots[];
    /** Kept out of the merged `slots` pool (PHB p. 164); null/absent for single-class casters and multiclass characters with no warlock levels. */
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
    /** Derived prepared-spell cap: the limit and current prepared count. */
    preparedSpellLimit?: number | null;
    preparedSpellCount?: number;
    /** "known" (SRD 5.1) means immediately castable; "prepared" (SRD 5.2) means prepared from a wider list; absent for a non-caster. */
    casterModel?: "known" | "prepared";
    /** Rendered verbatim, never composed client-side; both absent exactly when `casterModel` is. */
    preparedLabel?: string;
    alwaysAvailableLabel?: string;
    /** `entryId` matches a `Spell.id` in `spells`. */
    concentratingOn?: { entryId: string; spellName: string } | null;
  };

  resources?: CharacterResources;

  /** Always present, normalized on read; mutate via `applyConditionTransactions`, never PATCH. */
  conditions: ConditionsState;
  /** Resolved server-side for this character's edition; never author this text client-side. */
  exhaustionEffectText: string;
  /** Backend always serializes this (defaults to `[]`) despite the optional type. */
  immuneConditions?: ConditionKey[];
  /** Always present; each is also summed into its target skill/stat's tempModifier. */
  activeEffects: ActiveEffectsState;
  /** Derived from active conditions + buffs, resolved per roll via `resolveRollMode`; always present. */
  rollModifiers: RollModifier[];

  // resistances also feeds the auto-halve at damage-apply; these render as item-sourced sheet flags.
  resistances?: ItemDamageTrait[];
  damageImmunities?: ItemDamageTrait[];
  conditionImmunities?: ItemConditionImmunity[];
  grantedAdvantages?: ItemAdvantageGrant[];
  grantedProficiencies?: ItemProficiencyGrant[];

  /** Filtered by class/level/resource availability; see `AvailableAction`. Undefined only for characters without a class. */
  availableActions?: AvailableAction[];

  /** Damage faces start at 1 (flat 1 + STR mod), raised to d4 by Tavern Brawler. */
  unarmedStrike: DerivedAttack;
  /** `proficient` is true only when "Improvised Weapons" appears in `weaponProficiencies`, adding proficiency bonus to `attackBonus`. */
  improvisedWeapon: DerivedImprovisedAttack;

  /** REQUIRED, not optional — a fixture omitting it would silently render an empty attack picker. See `AttackRow`. */
  attackRows: AttackRow[];

  /** Weapon attacks per Attack action (Extra Attack), max across multiclass. */
  attacksPerAction: number;

  /** 20 by default, widened by Champion's Improved/Superior Critical; compare a kept d20 against this instead of a hardcoded 20. */
  critRange: number;

  /** A two-handed weapon in MAIN_HAND locks OFF_HAND; distinct from the internal "off-hand busy" notion that only picks a versatile die. */
  offHandLocked: boolean;

  /** Rogue Sneak Attack Nd6, absent for a non-rogue. See the `Rider` type. */
  sneakAttack?: DiceRider;

  /** Monk Stunning Strike focus save DC, absent below monk L5. */
  stunningStrike?: SaveRider;

  /** Push/Topple save DC; absent below monk L3 or off-subclass. Addle carries no save. */
  openHandTechnique?: SaveRider;
  /** Save DC + whether vibrations are set; absent below monk L17 or off-subclass. */
  quiveringPalm?: SaveRider;
  /** Absent for non-Battle-Masters; `maneuverChoiceCount`/`toolProfChoiceCount` stay on `resources` — those are choice counts, not save DCs. */
  maneuvers?: SaveRider;
  /** PHB'14 p.97; a plain `true` since there's no dice/DC to carry. Absent on a 2024 character — SRD 5.2/PHB'24 deleted the clause. */
  assassinate?: true;

  /** Taken ASI / feat entries, in the order chosen (clamped to advancementSlots.total). */
  advancements: AdvancementEntry[];
  /** How many advancement slots this character has earned at their level. */
  advancementSlots: AdvancementSlots;
  /** A partition separate from ASI slots. */
  fightingStyleSlots: AdvancementSlots;
  /** The level-gated subset of `classes` that has EARNED Fighting Style, not every class the character has — never derive this from `classes` client-side. */
  fightingStyleGrantingClasses: string[];

  classes?: ClassEntry[];

  /** Announce-only cited text; never itself a source of arithmetic on the client — derived numbers already fold into hitPoints/armorProficiencies/weaponProficiencies above. */
  speciesTraits: SpeciesTrait[];

  journal: JournalEntry[];

  /** Undefined when the character isn't in a campaign. */
  campaignId?: string;
  /** Absent when not in a campaign. */
  campaignPreferences?: CampaignPreferences;
  /** Authoritative rules edition for this sheet; write-once at creation. */
  rulesEdition: RulesEdition;
  /** Resolved server-side; always served, non-optional so a fixture can't silently omit it. */
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
  /** Undefined when the character isn't in a campaign. */
  campaignId?: string;
}
