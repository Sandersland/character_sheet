// Presentation layer over the character's served `attackRows` (#1434): selects
// rows for a surface and decorates each with the label strings that surface
// needs. The 5e math — attack/damage specs, the grip-resolved die, the
// Two-Weapon Fighting off-hand subtraction, and which dice riders are live —
// arrives already resolved from serializeCharacter and is never recomputed here.

import { formatRollSpec } from "@/lib/dice";
import type { RollSpec } from "@/lib/dice";
import type { Character } from "@/types/character";
import type {
  AttackDamageRider,
  AttackRollSpec,
  AttackRow,
  AttackRowKind,
  RollEventAttackComponents,
  RollEventDamageComponents,
  WeaponGrip,
} from "@character-sheet/shared-types";

// One dice-valued on-hit rider on a row (Flame Tongue +2d6 fire) with its label
// strings resolved: the chip text, the dice-engine roll source, and the Session
// Log source. A `condition` (e.g. "vs dragons") is reminder text — never
// auto-gated on a target.
export interface DamageRider {
  id: string;
  spec: AttackRollSpec;
  damageType?: string;
  label: string;
  rollLabel: string;
  logSource: string;
  condition?: string;
}

/**
 * One served `AttackRow` decorated for display + rolling.
 *
 * Everything numeric here is forwarded from the row unchanged; the strings are
 * this module's whole job. They are NOT served, and this docstring is the
 * decision record for why: their casing deliberately differs per surface —
 * "Unarmed strike attack" is the dice-engine roll label while "Unarmed Strike"
 * is the Session Log source, and the display name carries " (off-hand)" while
 * the roll/log labels keep the weapon's own name. One served string would force
 * one casing on all of them.
 */
export interface AttackEntry {
  id: string;
  name: string;
  attackLabel: string;
  damageLabel: string;
  note?: string;
  magical?: boolean;
  attackSpec: AttackRollSpec;
  damageSpec: AttackRollSpec;
  damageType: string;
  attackRollLabel: string;
  damageRollLabel: string;
  logSource: string;
  /** Dice-valued on-hit riders from THIS item's active capabilities (Flame Tongue +2d6). */
  damageRiders: DamageRider[];
  /**
   * Decomposed to-hit/damage math forwarded from the row (#1235 combat-log
   * drill-in) — undefined on the unarmed/improvised rows, which the backend
   * doesn't decompose.
   */
  attackComponents?: RollEventAttackComponents;
  damageComponents?: RollEventDamageComponents;
}

// Compact term label for a dice rider, e.g. "+2d6 fire" or "+1d4".
function damageRiderLabel(count: number, faces: number, damageType?: string): string {
  const dice = `+${count}d${faces}`;
  return damageType ? `${dice} ${damageType}` : dice;
}

// `sourceName` is the owning row's unadorned item name: an off-hand swing's
// riders still roll and log under the weapon's own name, not "Dagger (off-hand)".
function decorateRider(sourceName: string, rider: AttackDamageRider): DamageRider {
  const label = damageRiderLabel(rider.spec.count, rider.spec.faces, rider.damageType);
  return {
    id: rider.id,
    spec: rider.spec,
    damageType: rider.damageType,
    label,
    rollLabel: `${sourceName}: ${label}`,
    logSource: sourceName,
    ...(rider.condition ? { condition: rider.condition } : {}),
  };
}

// 5e critical hit: doubles the weapon damage **dice** only (`crit` flag →
// dice.ts doubles `count`), leaving the flat `modifier` single. Reused for the
// weapon's own damage spec and, consistently, for each dice-valued `DamageRider`
// (Flame Tongue +2d6 → +4d6 on a crit) — both are plain count/faces/modifier
// specs, so the same doubling rule applies. The Battle Master superiority die is
// a flat add (ManeuverPrompt), not weapon dice, so it never routes through here.
//
// This is the ONE sanctioned client-side exception to "attack math is served"
// (#1434/#1378): the crit is player input arriving after serialization, over a
// spec the player may have re-rolled, so there is nothing for the server to
// resolve. It is not duplicated rules logic — do not flag it again.
export function critDamageSpec(spec: RollSpec): RollSpec {
  return { ...spec, crit: true };
}

// " (two-handed)" suffix for a two-handed grip, else "". Absent on the
// unarmed/improvised rows, which have no grip.
export function weaponGripLabel(grip: WeaponGrip | undefined): string {
  return grip === "versatile-two-handed" || grip === "two-handed" ? " (two-handed)" : "";
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

// One equipped-weapon row. Shared by the main-hand and off-hand rows so the two
// never drift: the " (off-hand)" display suffix is the only difference, and it
// tags the form header, tally strip and turn-summary banner so a two-weapon swing
// reads distinctly from a main-hand attack (#813).
function decorateWeaponRow(row: AttackRow): AttackEntry {
  const gripLabel = weaponGripLabel(row.grip);
  return {
    id: row.id,
    name: row.offHand ? `${row.name} (off-hand)` : row.name,
    attackLabel: `+${row.attackSpec.modifier}`,
    damageLabel: `${formatRollSpec(row.damageSpec)} ${row.damageType}${gripLabel}`,
    attackSpec: row.attackSpec,
    damageSpec: row.damageSpec,
    damageType: row.damageType,
    attackRollLabel: `${row.name} attack`,
    damageRollLabel: `${row.name} damage (${row.damageType})`,
    logSource: row.name,
    damageRiders: row.damageRiders.map((rider) => decorateRider(row.name, rider)),
    attackComponents: row.attackComponents,
    damageComponents: row.damageComponents,
  };
}

// The Unarmed Strike row — flat display when faces === 1 (baseline).
function decorateUnarmedRow(row: AttackRow, unarmed: Character["unarmedStrike"]): AttackEntry {
  return {
    id: row.id,
    name: row.name,
    attackLabel: `+${row.attackSpec.modifier}`,
    damageLabel: `${unarmedDamageDisplay(unarmed)} ${row.damageType}`,
    magical: row.magical,
    attackSpec: row.attackSpec,
    damageSpec: row.damageSpec,
    damageType: row.damageType,
    attackRollLabel: "Unarmed strike attack",
    damageRollLabel: `Unarmed strike damage (${row.damageType})`,
    logSource: row.name,
    damageRiders: [],
  };
}

// The Improvised Weapon row — signed bonus, "(no proficiency)" note when
// unproficient. `proficient` is read off the served improvisedWeapon rather than
// duplicated onto the row: this note is its only reader.
function decorateImprovisedRow(
  row: AttackRow,
  improvised: Character["improvisedWeapon"],
): AttackEntry {
  return {
    id: row.id,
    name: row.name,
    attackLabel: `${row.attackSpec.modifier >= 0 ? "+" : ""}${row.attackSpec.modifier}`,
    damageLabel: `${formatRollSpec(row.damageSpec)} ${row.damageType}`,
    note: improvised.proficient ? undefined : "(no proficiency)",
    attackSpec: row.attackSpec,
    damageSpec: row.damageSpec,
    damageType: row.damageType,
    attackRollLabel: "Improvised weapon attack",
    damageRollLabel: `Improvised weapon damage (${row.damageType})`,
    logSource: row.name,
    damageRiders: [],
  };
}

// Kinds differ only in label vocabulary — see each decorator.
function decorateRow(character: Character, row: AttackRow): AttackEntry {
  switch (row.kind) {
    case "unarmed":
      return decorateUnarmedRow(row, character.unarmedStrike);
    case "improvised":
      return decorateImprovisedRow(row, character.improvisedWeapon);
    default:
      return decorateWeaponRow(row);
  }
}

// The one row of a singleton kind. Unarmed and improvised are always served
// (everyone can punch or swing a chair leg), so a missing row is a serializer
// bug and says so instead of rendering an empty picker.
function rowOfKind(character: Character, kind: AttackRowKind): AttackRow {
  const row = character.attackRows.find((r) => r.kind === kind);
  if (!row) throw new Error(`Character ${character.id} has no ${kind} attack row`);
  return row;
}

// The non-weapon rows in served order (unarmed, then improvised).
function unarmedAndImprovisedEntries(character: Character): AttackEntry[] {
  return character.attackRows
    .filter((row) => row.kind !== "weapon")
    .map((row) => decorateRow(character, row));
}

// The Attack action's rows in served order: equipped weapons (raw, un-deduped),
// then unarmed, then improvised. The off-hand row is excluded — it belongs to the
// bonus action and shares its weapon's id (see `AttackRow`).
export function buildAttackEntries(character: Character): AttackEntry[] {
  return character.attackRows
    .filter((row) => !row.offHand)
    .map((row) => decorateRow(character, row));
}

/**
 * The single off-hand attack row for Two-Weapon Fighting (#732), or null when the
 * loadout can't dual-wield — the server emits the row only with two weapons
 * equipped, and its damage already has the ability modifier dropped
 * (`deriveOffHandDamage`). Whether the swing is available this turn is the gated
 * action row's question, not this one's.
 */
export function buildOffHandEntry(character: Character): AttackEntry | null {
  const row = character.attackRows.find((r) => r.offHand);
  return row ? decorateWeaponRow(row) : null;
}

// Distinct equipped-weapon rows, collapsing same-name duplicates (two Daggers →
// one entry). First occurrence wins so its attack/damage snapshot drives the
// card. A presentation choice about which card renders, not a 5e rule — the
// server emits one row per equipped weapon, un-deduped.
function equippedWeaponEntries(character: Character): AttackEntry[] {
  const seen = new Set<string>();
  const entries: AttackEntry[] = [];
  for (const row of character.attackRows) {
    if (row.kind !== "weapon" || row.offHand || seen.has(row.name)) continue;
    seen.add(row.name);
    entries.push(decorateWeaponRow(row));
  }
  return entries;
}

/**
 * The single-swing entry for InlineOffHandPicker's bonus-action picker: the
 * off-hand weapon (TWF) or the locked Unarmed Strike profile (Bonus Unarmed
 * Strike, #1218). Kept out of the component body to keep its complexity
 * budget clear of this branch.
 */
export function buildBonusSwingEntry(character: Character, variant: "twf" | "unarmed"): AttackEntry | null {
  return variant === "unarmed"
    ? decorateRow(character, rowOfKind(character, "unarmed"))
    : buildOffHandEntry(character);
}

// Flurry of Blows' single form — 2024 rules grant no weapon choice, so unlike
// buildAttackForms this never includes equipped weapons or Improvised (#1217).
export function buildUnarmedOnlyForms(character: Character): AttackEntry[] {
  return [decorateRow(character, rowOfKind(character, "unarmed"))];
}

// Flurry of Blows strike count: two Unarmed Strikes as a bonus action —
// three at Heightened Focus, Monk level 10 in SRD 5.2 (#1244); SRD 5.1 has
// no three-strike upgrade at any level. Both facts are resolved server-side
// now (#1505) onto the served `flurryOfBlows` AvailableAction's `count`
// (DERIVED_ACTIONS, actions.ts) — this reads that value rather than
// re-deriving a level threshold, which is what let a 2014 monk at L10+
// wrongly get a three-strike Flurry from a client-side rule blind to
// edition. Falls back to 2 (every edition's floor) when the character has
// no flurryOfBlows row yet (e.g. mid-fetch).
export function flurryStrikeCount(character: Character): number {
  return character.availableActions?.find((a) => a.key === "flurryOfBlows")?.count ?? 2;
}

// The "Attacking with" form options for the single attack card (#786): deduped
// equipped weapons, then Unarmed Strike, then Improvised Weapon. The first row is
// the main-hand weapon (or Unarmed when nothing is equipped) — the default form.
export function buildAttackForms(character: Character): AttackEntry[] {
  return [...equippedWeaponEntries(character), ...unarmedAndImprovisedEntries(character)];
}
