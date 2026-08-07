// Catalog entitlement wire types (#1796, epic #1795 1/6) — locked here so
// Waves 1-3 (resolver, grant/fork routes, reads rewiring) build against one
// shape instead of each inventing its own. Mirrors the Prisma CatalogKind/
// CatalogScope enums as string unions, same pattern as edition.ts's
// RulesEdition: pure types, no dependency on the generated client.
import type { SpellSchool } from "./spellcasting.js";

/** Only "SPELL" exists today; a future kind (Item, …) widens this union. */
export type CatalogKind = "SPELL";

/**
 * GLOBAL = seeded system content, visible to everyone. USER = a player's
 * homebrew, visible only to them until granted into a campaign. CAMPAIGN = a
 * DM's homebrew, scoped to their campaign.
 */
export type CatalogScope = "GLOBAL" | "USER" | "CAMPAIGN";

/** The entitlement metadata every catalog-content wire row now carries. */
export interface CatalogMeta {
  entryId: string;
  scope: CatalogScope;
  isFork: boolean;
  forkedFromId: string | null;
}

/** A `POST …/grants` / `GET` response row for a CatalogGrant. */
export interface GrantWire {
  id: string;
  catalogEntryId: string;
  campaignId: string;
}

/**
 * `GET /api/spells` row shape, with the CatalogEntry metadata every catalog
 * row now carries alongside it (#1796). `catalog` is additive over the
 * pre-#1796 response — every other field matches what
 * `backend/src/routes/catalog/spells.ts`'s `serializeCatalogSpellRow` already
 * serves. Slice 1 only locks the type; slice 3 is what makes the route
 * actually populate `catalog` off the resolver.
 */
export interface SpellWire {
  id: string;
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  cantripScaling: boolean;
  effectKind?: "damage" | "heal" | "buff";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  saveEffect?: "half" | "none";
  upcastDicePerLevel?: number;
  catalog: CatalogMeta;
}
