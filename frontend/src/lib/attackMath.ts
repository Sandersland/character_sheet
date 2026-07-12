// Pure attack-row math for InlineAttackPicker: builds the equipped-weapon,
// unarmed-strike, and improvised-weapon rows plus their roll/log label strings.

import { formatRollSpec } from "@/lib/dice";
import type { RollSpec } from "@/lib/dice";
import type { Character, InventoryItem, WeaponDetail } from "@/types/character";

export interface RollSpecTriple {
  count: number;
  faces: number;
  modifier: number;
}

// One dice-valued on-hit rider a weapon adds to its damage roll (Flame Tongue
// +2d6 fire): its own spec + damage type, rolled as a separate typed term. A
// `condition` (e.g. "vs dragons") is reminder text — never auto-gated on a target.
export interface DamageRider {
  id: string;
  spec: RollSpecTriple;
  damageType?: string;
  label: string;
  rollLabel: string;
  logSource: string;
  condition?: string;
}

// One attack row, fully resolved for display + rolling. Roll-source labels
// (passed to the dice engine) and log-source (passed to the Session Log) are
// precomputed here because their casing differs, e.g. "Unarmed strike attack"
// roll label vs "Unarmed Strike" log source.
export interface AttackEntry {
  id: string;
  name: string;
  attackLabel: string;
  damageLabel: string;
  note?: string;
  magical?: boolean;
  attackSpec: RollSpecTriple;
  damageSpec: RollSpecTriple;
  damageType: string;
  attackRollLabel: string;
  damageRollLabel: string;
  logSource: string;
  /** Dice-valued on-hit riders from THIS item's active capabilities (Flame Tongue +2d6). */
  damageRiders: DamageRider[];
}

// A weapon's capabilities are live when equipped/attuned; an attunement-required
// item needs attunement specifically, so unattuning removes its riders.
export function capabilitiesActive(item: Pick<InventoryItem, "equipped" | "attuned" | "requiresAttunement">): boolean {
  // Mirror backend isItemActive exactly: attunement items gate on `attuned`,
  // everything else on `equipped` (an unattunable item that is somehow `attuned`
  // is unreachable, but we don't want the frontend gate to diverge from the wire).
  return item.requiresAttunement ? item.attuned : item.equipped;
}

// Compact term label for a dice rider, e.g. "+2d6 fire" or "+1d4".
function damageRiderLabel(count: number, faces: number, damageType?: string): string {
  const dice = `+${count}d${faces}`;
  return damageType ? `${dice} ${damageType}` : dice;
}

// This item's dice-valued on-hit passiveBonus riders (target: damage, op: add,
// dice present), scoped to THIS item only so other items never leak in. Scalar,
// setTo, and non-damage capabilities are not riders. Empty when the item's
// capabilities are inactive (not equipped/attuned).
export function weaponDamageRiders(item: InventoryItem): DamageRider[] {
  if (!capabilitiesActive(item)) return [];
  const riders: DamageRider[] = [];
  (item.capabilities ?? []).forEach((cap, index) => {
    if (cap.kind !== "passiveBonus" || cap.target !== "damage") return;
    if ((cap.op ?? "add") !== "add" || !cap.dice) return;
    const { count, faces, damageType } = cap.dice;
    const label = damageRiderLabel(count, faces, damageType);
    riders.push({
      id: `${item.id}:rider:${index}`,
      spec: { count, faces, modifier: 0 },
      damageType,
      label,
      rollLabel: `${item.name}: ${label}`,
      logSource: item.name,
      ...(cap.condition ? { condition: cap.condition } : {}),
    });
  });
  return riders;
}

// d20 spec for a weapon's attack roll.
function weaponAttackSpec(w: WeaponDetail): RollSpecTriple {
  return { count: 1, faces: 20, modifier: w.attackBonus ?? 0 };
}

// Grip-resolved damage spec: server-derived `w.damage` first, legacy flat fields as fallback.
export function weaponDamageSpec(w: WeaponDetail): RollSpecTriple {
  return w.damage
    ? { count: w.damage.damageDiceCount, faces: w.damage.damageDiceFaces, modifier: w.damage.damageModifier }
    : { count: w.damageDiceCount, faces: w.damageDiceFaces, modifier: w.damageModifier };
}

// 5e critical hit: doubles the weapon damage **dice** only (`crit` flag →
// dice.ts doubles `count`), leaving the flat `modifier` single. Reused for the
// weapon's own damage spec and, consistently, for each dice-valued `DamageRider`
// (Flame Tongue +2d6 → +4d6 on a crit) — both are plain count/faces/modifier
// specs, so the same doubling rule applies. The Battle Master superiority die is
// a flat add (ManeuverPrompt), not weapon dice, so it never routes through here.
export function critDamageSpec(spec: RollSpec): RollSpec {
  return { ...spec, crit: true };
}

// Grip-resolved damage type: server-derived first, legacy flat field as fallback.
export function weaponDamageType(w: WeaponDetail): string {
  return w.damage?.damageType ?? w.damageType;
}

// " (two-handed)" suffix for a two-handed grip, else "".
export function weaponGripLabel(w: WeaponDetail): string {
  return w.damage?.grip === "versatile-two-handed" || w.damage?.grip === "two-handed"
    ? " (two-handed)"
    : "";
}

// Unarmed damage display — flat value when faces === 1 (baseline), or die notation.
export function unarmedDamageDisplay(unarmed: Character["unarmedStrike"]): number | string {
  const { faces, modifier } = unarmed.damage;
  return faces === 1
    ? Math.max(1, 1 + modifier)
    : `1d${faces}${modifier !== 0 ? ` ${modifier < 0 ? "-" : "+"} ${Math.abs(modifier)}` : ""}`;
}

// Gate: only show maneuver affordances when the character has a Battle Master die pool.
export function hasSuperiorityDice(character: Character): boolean {
  return (
    character.resources?.pools?.some(
      (p) => p.key === "superiorityDice" && p.total > 0,
    ) ?? false
  );
}

// Attacks are exhausted when used >= total. When the counter is null (Flurry/
// Opportunity context) there is no counter → always allow.
export function attacksExhausted(attack: { used: number; total: number } | null): boolean {
  return attack !== null && attack.used >= attack.total;
}

// One equipped-weapon attack row. Shared by buildAttackEntries and the off-hand
// (TWF) builder so the two never drift.
function buildWeaponEntry(item: InventoryItem): AttackEntry {
  const w = item.weapon!;
  const damageSpec = weaponDamageSpec(w);
  const damageType = weaponDamageType(w);
  const gripLabel = weaponGripLabel(w);
  return {
    id: item.id,
    name: item.name,
    attackLabel: `+${w.attackBonus ?? 0}`,
    damageLabel: `${formatRollSpec(damageSpec)} ${damageType}${gripLabel}`,
    attackSpec: weaponAttackSpec(w),
    damageSpec,
    damageType,
    attackRollLabel: `${item.name} attack`,
    damageRollLabel: `${item.name} damage (${damageType})`,
    logSource: item.name,
    damageRiders: weaponDamageRiders(item),
  };
}

function equippedWeapons(character: Character): InventoryItem[] {
  return character.inventory.filter(
    (item) => item.category === "weapon" && item.equipped && item.weapon,
  );
}

/**
 * The single off-hand attack row for Two-Weapon Fighting (#732), or null when
 * the loadout can't dual-wield (< 2 equipped weapons). Prefers the weapon in the
 * OFF_HAND paper-doll slot, falling back to the second equipped weapon.
 *
 * Off-hand damage omits the governing ability modifier (PHB p.195) UNLESS the
 * character has the Two-Weapon Fighting style. We subtract `damage.abilityModifier`
 * (the server-derived component) rather than recomputing the ability-selection
 * rule on the client. `max(0, …)` keeps a negative modifier (RAW: only a positive
 * ability mod is dropped), and any melee-damage buff folded into `damageModifier`
 * (e.g. Rage) survives because only the ability component is removed.
 */
export function buildOffHandEntry(character: Character): AttackEntry | null {
  const weapons = equippedWeapons(character);
  if (weapons.length < 2) return null;
  const offHand = weapons.find((i) => i.equippedSlot === "OFF_HAND") ?? weapons[1];

  const entry = buildWeaponEntry(offHand);
  const hasStyle = character.resources?.fightingStyle === "twoWeaponFighting";
  // Undefined only for a legacy weapon serialized before #732 (no ability-mod
  // component) — skip the subtraction and show the full modifier, matching the
  // pre-#732 behavior rather than silently dropping the wrong amount.
  const abilityMod = offHand.weapon!.damage?.abilityModifier;
  const modifier =
    hasStyle || abilityMod === undefined
      ? entry.damageSpec.modifier
      : entry.damageSpec.modifier - Math.max(0, abilityMod);
  const damageSpec = { ...entry.damageSpec, modifier };
  const gripLabel = weaponGripLabel(offHand.weapon!);

  return {
    ...entry,
    damageSpec,
    damageLabel: `${formatRollSpec(damageSpec)} ${entry.damageType}${gripLabel}`,
  };
}

// Distinct equipped-weapon rows, collapsing same-name duplicates (two Daggers →
// one entry). First occurrence wins so its attack/damage snapshot drives the card.
export function buildEquippedWeaponEntries(character: Character): AttackEntry[] {
  const seen = new Set<string>();
  const entries: AttackEntry[] = [];
  for (const item of equippedWeapons(character)) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    entries.push(buildWeaponEntry(item));
  }
  return entries;
}

// The Unarmed Strike attack row — flat display when faces === 1 (baseline).
function buildUnarmedEntry(character: Character): AttackEntry {
  const { unarmedStrike } = character;
  const unarmedSpec: RollSpecTriple = {
    count: unarmedStrike.damage.count,
    faces: unarmedStrike.damage.faces,
    modifier: unarmedStrike.damage.modifier,
  };
  return {
    id: "unarmed",
    name: "Unarmed Strike",
    attackLabel: `+${unarmedStrike.attackBonus}`,
    damageLabel: `${unarmedDamageDisplay(unarmedStrike)} bludgeoning`,
    magical: unarmedStrike.magical ?? false,
    attackSpec: { count: 1, faces: 20, modifier: unarmedStrike.attackBonus },
    damageSpec: unarmedSpec,
    damageType: "bludgeoning",
    attackRollLabel: "Unarmed strike attack",
    damageRollLabel: "Unarmed strike damage (bludgeoning)",
    logSource: "Unarmed Strike",
    damageRiders: [],
  };
}

// The Improvised Weapon attack row — signed bonus, "(no proficiency)" note when unproficient.
function buildImprovisedEntry(character: Character): AttackEntry {
  const { improvisedWeapon } = character;
  const improvisedSpec: RollSpecTriple = {
    count: improvisedWeapon.damage.count,
    faces: improvisedWeapon.damage.faces,
    modifier: improvisedWeapon.damage.modifier,
  };
  return {
    id: "improvised",
    name: "Improvised Weapon",
    attackLabel: `${improvisedWeapon.attackBonus >= 0 ? "+" : ""}${improvisedWeapon.attackBonus}`,
    damageLabel: `${formatRollSpec(improvisedSpec)} bludgeoning`,
    note: improvisedWeapon.proficient ? undefined : "(no proficiency)",
    attackSpec: { count: 1, faces: 20, modifier: improvisedWeapon.attackBonus },
    damageSpec: improvisedSpec,
    damageType: "bludgeoning",
    attackRollLabel: "Improvised weapon attack",
    damageRollLabel: "Improvised weapon damage (bludgeoning)",
    logSource: "Improvised Weapon",
    damageRiders: [],
  };
}

// Builds the ordered attack rows: equipped weapons (raw, un-deduped), then unarmed, then improvised.
export function buildAttackEntries(character: Character): AttackEntry[] {
  return [
    ...equippedWeapons(character).map(buildWeaponEntry),
    buildUnarmedEntry(character),
    buildImprovisedEntry(character),
  ];
}

// The "Attacking with" form options for the single attack card (#786): deduped
// equipped weapons, then Unarmed Strike, then Improvised Weapon. The first row is
// the main-hand weapon (or Unarmed when nothing is equipped) — the default form.
export function buildAttackForms(character: Character): AttackEntry[] {
  return [
    ...buildEquippedWeaponEntries(character),
    buildUnarmedEntry(character),
    buildImprovisedEntry(character),
  ];
}
