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

// Builds the ordered attack rows: equipped weapons, then unarmed, then improvised.
export function buildAttackEntries(character: Character): AttackEntry[] {
  const entries: AttackEntry[] = [];

  const equippedWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && item.equipped && item.weapon,
  );
  for (const item of equippedWeapons) {
    const w = item.weapon!;
    const damageSpec = weaponDamageSpec(w);
    const damageType = weaponDamageType(w);
    const gripLabel = weaponGripLabel(w);
    entries.push({
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
    });
  }

  const { unarmedStrike, improvisedWeapon } = character;

  const unarmedSpec: RollSpecTriple = {
    count: unarmedStrike.damage.count,
    faces: unarmedStrike.damage.faces,
    modifier: unarmedStrike.damage.modifier,
  };
  entries.push({
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
  });

  const improvisedSpec: RollSpecTriple = {
    count: improvisedWeapon.damage.count,
    faces: improvisedWeapon.damage.faces,
    modifier: improvisedWeapon.damage.modifier,
  };
  entries.push({
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
  });

  return entries;
}
