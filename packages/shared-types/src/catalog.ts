import type { SpellSchool } from "./spellcasting.js";

/** Only "SPELL" exists today; a future kind (Item, …) widens this union. */
export type CatalogKind = "SPELL";

/** GLOBAL = seeded system content; USER = player homebrew, private until granted; CAMPAIGN = DM homebrew scoped to their campaign. */
export type CatalogScope = "GLOBAL" | "USER" | "CAMPAIGN";

/**
 * `editable` mirrors `isCatalogEntryEditable`, computed server-side only —
 * never re-derive it client-side. `scope === "CAMPAIGN"` is not a "mine"
 * signal: a CAMPAIGN row is served to every campaign member, not just its DM.
 */
export interface CatalogMeta {
  entryId: string;
  scope: CatalogScope;
  isFork: boolean;
  forkedFromId: string | null;
  editable: boolean;
}

/** A `POST …/grants` / `GET` response row for a CatalogGrant. */
export interface GrantWire {
  id: string;
  catalogEntryId: string;
  campaignId: string;
}

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
