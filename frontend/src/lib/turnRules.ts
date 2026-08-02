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
 * The Light requirement holds in BOTH editions and the **Two-Weapon Fighting**
 * style never waives it (#1496). SRD 5.1 / PHB'14 p. 72 grants the style only "add
 * your ability modifier to the damage of the second attack"; SRD 5.2 / PHB'24 says
 * the opposite of a waiver outright — the benefit applies only "while wielding a
 * weapon that has the Light property in each hand". The editions agree, so there is
 * one rule and no `edition` parameter. The feature that WOULD lift the
 * requirement is the **Dual Wielder** feat, which is not seeded in this app, so do
 * not reintroduce a style short-circuit here: the style's entire effect is the
 * ability modifier on off-hand DAMAGE, resolved by `deriveOffHandDamage`, and it
 * never touches eligibility. (The paper-doll already prevents equipping a two-handed
 * weapon alongside an off-hand, so we don't re-check that here.)
 *
 * The existing `offHandBusy` field on the serialized character covers the
 * versatile-grip calculation but is a boolean that conflates "shield equipped"
 * and "two weapons equipped." We re-derive from inventory here because we need
 * the distinction: two light weapons → TWF affordance; one weapon + shield → no TWF.
 */
export function canTwoWeaponFight(
  inventory: Array<{ equipped: boolean; category: string; weapon?: { light: boolean } | null }>,
): boolean {
  const equippedWeapons = inventory.filter(
    (i) => i.equipped && i.category === "weapon" && i.weapon,
  );
  if (equippedWeapons.length < 2) return false;
  return equippedWeapons.slice(0, 2).every((i) => i.weapon?.light === true);
}
