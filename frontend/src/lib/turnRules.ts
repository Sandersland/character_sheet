/**
 * Pure 5e turn-economy rules — no JSX, no side effects.
 *
 * Per-class action lists are derived from class/level rather than persisted
 * (derive-don't-persist pattern, same as level/profBonus). Extra Attack counts
 * are derived server-side and read off `character.attacksPerAction`.
 *
 * ⚑ MOVEMENT is intentionally excluded from this module. Speed / difficult-terrain
 * tracking is flagged for a future phase.
 */

/**
 * Returns true when the character's equipped loadout allows a TWF bonus-action
 * off-hand attack: at least two weapons equipped, both of which are light
 * (light property = true on the weapon detail). The off-hand attack's DAMAGE is a
 * separate question, resolved server-side by `deriveOffHandDamage` and served on
 * the off-hand `AttackRow` — this function only answers availability.
 *
 * The **Two-Weapon Fighting fighting style** (#1137: now a feat, its
 * "offhandAbilityDamage" improvement) removes the light restriction, so when
 * `canOffhandAbilityDamage` is true any two equipped weapons qualify. (The
 * paper-doll already prevents equipping a two-handed weapon alongside an
 * off-hand, so we don't re-check that here.)
 *
 * The existing `offHandBusy` field on the serialized character covers the
 * versatile-grip calculation but is a boolean that conflates "shield equipped"
 * and "two weapons equipped." We re-derive from inventory here because we need
 * the distinction: two light weapons → TWF affordance; one weapon + shield → no TWF.
 */
export function canTwoWeaponFight(
  inventory: Array<{ equipped: boolean; category: string; weapon?: { light: boolean } | null }>,
  canOffhandAbilityDamage = false,
): boolean {
  const equippedWeapons = inventory.filter(
    (i) => i.equipped && i.category === "weapon" && i.weapon,
  );
  if (equippedWeapons.length < 2) return false;
  // The Two-Weapon Fighting style removes the light-weapon restriction.
  if (canOffhandAbilityDamage) return true;
  // Baseline: both held weapons must have the light property.
  return equippedWeapons.slice(0, 2).every((i) => i.weapon?.light === true);
}
