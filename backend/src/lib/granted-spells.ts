// 5e rules data: cantrips/spells a subclass grants for free (no player choice).
// These are pure-derived at serialize time and never persisted — the derived id
// scheme `granted:<subclass>:<spell>` is the seam a future side-table would key
// on if a stateful granted spell ever appears. Snapshotting granted content is a
// Phase-D versioning concern (introduced uniformly with spells/items), not by
// persisting grants ad-hoc.

import { castUsesTotal, chargePoolOf, readCapability, type CapabilityColumns } from "./capabilities.js";
import type { SpellEntry } from "./spell-state.js";

// The six ability scores, lowercase — the shape of Character.abilityScores.
export type AbilityScores = Record<
  "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma",
  number
>;

// A subclass-granted spell, keyed by lowercase subclass name. Each descriptor is
// a full SpellEntry snapshot (matching the catalog row shape) plus a stable id.
interface GrantedSpellRule {
  gateLevel: number;
  spells: SpellEntry[];
  // Casting ability the granted spells use for save DC / attack bonus.
  castingAbility: keyof AbilityScores;
}

const MINOR_ILLUSION: SpellEntry = {
  id: "granted:way-of-shadow:minor-illusion",
  name: "Minor Illusion",
  level: 0,
  school: "illusion",
  prepared: true,
  source: "subclass",
  castingTime: "1 action",
  range: "30 ft",
  duration: "1 minute",
  description:
    "Create a sound or an image of an object within range that lasts for the duration. The illusion ends if you dismiss it or cast this spell again. A creature that uses its action to examine the illusion can determine it is illusory with a successful Investigation check against your spell save DC.",
  components: { verbal: true, somatic: true, material: true, materialDescription: "a bit of fleece" },
};

const SUBCLASS_GRANTED_SPELLS: Record<string, GrantedSpellRule> = {
  "way of shadow": { gateLevel: 3, spells: [MINOR_ILLUSION], castingAbility: "wisdom" },
};

// Pure function: the spells a (subclass, level) grants for free. Below the gate
// level, or for a subclass with no grants, returns []. className is accepted for
// signature symmetry with the other derivers; the subclass key is unambiguous.
export function deriveGrantedSpells(
  _className: string,
  subclass: string | undefined,
  level: number,
): SpellEntry[] {
  if (!subclass) return [];
  const rule = SUBCLASS_GRANTED_SPELLS[subclass.toLowerCase()];
  if (!rule || level < rule.gateLevel) return [];
  return rule.spells.map((s) => ({ ...s, components: s.components ? { ...s.components } : s.components }));
}

// The casting ability a subclass's granted spells use (default Wisdom).
export function deriveGrantedCastingAbility(subclass: string | undefined): keyof AbilityScores {
  if (!subclass) return "wisdom";
  return SUBCLASS_GRANTED_SPELLS[subclass.toLowerCase()]?.castingAbility ?? "wisdom";
}

// The minimal inventory-item shape item-spell derivation needs: an item is a
// live spell source only while equipped OR attuned (same gate as passive bonuses).
export interface ItemSpellSourceItem {
  id: string;
  name: string;
  equipped: boolean;
  attuned: boolean;
  capabilities: (CapabilityColumns & { id: string; used?: number | null })[];
}

// Item-granted spells (#528), derived at read time from a holder's active items.
// The derived entry id is the `item:<inventoryItemId>:<spellId>:<capabilityId>`
// seam — a stable, disjoint id space (like `granted:` and `shadow-art:`) that the
// cast op matches on to resolve the source capability (via meta.capabilityId), and
// that concentration/resolveConcentration key on. The trailing capabilityId keeps
// the id unique when one item carries two castSpell caps for the SAME spell.
// Never persisted: re-derived on every read from the InventoryCapability rows.
export function deriveItemSpells(items: ItemSpellSourceItem[]): SpellEntry[] {
  const out: SpellEntry[] = [];
  for (const item of items) {
    if (!item.equipped && !item.attuned) continue;
    // The item's shared charge pool (#555): charges-costed casts draw from it,
    // so their uses columns mirror the pool's remaining/max. Resolved once per item.
    const pool = chargePoolOf(item.capabilities);
    for (const col of item.capabilities) {
      const cap = readCapability(col);
      if (cap.kind !== "castSpell") continue;
      let total: number;
      let remaining: number;
      let poolCapabilityId: string | null = null;
      if (cap.resource === "charges") {
        // No pool on the item = misauthored (authoring forbids it): exhausted, not a crash.
        total = pool ? pool.cap.maxCharges : 0;
        remaining = pool ? Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0)) : 0;
        poolCapabilityId = pool?.row.id ?? null;
      } else {
        total = castUsesTotal(cap);
        const used = col.used ?? 0;
        remaining = total === Infinity ? Infinity : Math.max(0, total - used);
      }
      out.push({
        id: `item:${item.id}:${cap.spellId}:${col.id}`,
        spellId: cap.spellId,
        name: cap.spellName || "Item spell",
        level: cap.spellLevel,
        school: "evocation",
        prepared: true,
        castingTime: "1 action",
        range: "—",
        duration: cap.concentration ? "Concentration" : "—",
        description: cap.description ?? "",
        concentration: cap.concentration,
        source: "item",
        item: {
          inventoryItemId: item.id,
          capabilityId: col.id,
          itemName: item.name,
          castLevel: cap.castLevel,
          resource: cap.resource,
          usesRemaining: remaining,
          usesTotal: total,
          dcMode: cap.dcMode,
          dc: cap.dcMode === "fixed" ? cap.dcValue ?? null : null,
          attackMode: cap.attackMode,
          attack: cap.attackMode === "fixed" ? cap.attackValue ?? null : null,
          ...(cap.resource === "charges" ? { poolCapabilityId, chargeCost: cap.chargeCost } : {}),
        },
      });
    }
  }
  return out;
}
