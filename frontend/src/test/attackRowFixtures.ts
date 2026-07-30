/**
 * Served attack-row fixtures (#1434).
 *
 * The session turn sheets read `character.attackRows`, so a fixture must state the
 * rows the server would have served. Deliberately a defaulting builder and NOT a
 * projection of `character.inventory`: deriving rows from inventory in test code
 * would recreate the client-side attack math this issue retired — and fallow's
 * clone gate reports it as a duplicate of `buildAttackRowsView` when you try.
 */

import type { AttackRow } from "@character-sheet/shared-types";

/** One served row; `id`/`kind`/`name` are always the fixture's business. */
export function attackRow(
  over: Partial<AttackRow> & Pick<AttackRow, "id" | "kind" | "name">,
): AttackRow {
  return {
    attackSpec: { count: 1, faces: 20, modifier: 0 },
    damageSpec: { count: 1, faces: 4, modifier: 0 },
    damageType: "bludgeoning",
    magical: false,
    offHand: false,
    damageRiders: [],
    ...over,
  };
}

/**
 * The two rows every payload always carries, at the +2 / d1-baseline numbers most
 * fixtures use. Spread-override when a fixture's `unarmedStrike` differs — the row
 * feeds the attack label while `unarmedStrike` feeds the damage display, so the two
 * have to agree.
 */
export const UNARMED_ROW = attackRow({
  id: "unarmed",
  kind: "unarmed",
  name: "Unarmed Strike",
  attackSpec: { count: 1, faces: 20, modifier: 2 },
  damageSpec: { count: 1, faces: 1, modifier: 0 },
});

export const IMPROVISED_ROW = attackRow({
  id: "improvised",
  kind: "improvised",
  name: "Improvised Weapon",
  attackSpec: { count: 1, faces: 20, modifier: 2 },
});
