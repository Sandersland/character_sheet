/**
 * Shared-campaign wire types: campaigns, entity registry, campaign items, and identity merges.
 */

import type { ArmorDetail, ArmorDetailInput, AttunementPrereqKind, ConsumableDetail, EquipSlot, ItemCapability, ItemCategory, ItemRarity, WeaponDetail, WeaponDetailInput } from "./inventory";
import type { JournalEntryKind } from "./journal";
import type { Currency } from "./primitives";

/**
 * A character's play preferences for its current campaign (#537). Always present
 * on the wire (defaulting both flags to false) when the character is attached to
 * a campaign; absent otherwise. Toggles land with #116 / #462.
 */
export interface CampaignPreferences {
  /** Let the DM read this character's sheet. */
  shareWithDm: boolean;
  /** Auto-roll healing when this character targets a friendly. */
  autoFriendlyHealing: boolean;
}

/** Shared campaigns (#246). */
export type CampaignRole = "OWNER" | "PLAYER";

export interface CampaignMember {
  id: string;
  userId: string;
  role: CampaignRole;
  user: { id: string; name: string | null; email: string | null; imageUrl: string | null };
}

export interface Campaign {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  members: CampaignMember[];
  /** Present on GET /api/campaigns/:id — each member character (id, name, ownerId). */
  characters?: { id: string; name: string; ownerId: string }[];
  /** The caller's role in this campaign — surfaced by the list + detail reads. */
  role?: CampaignRole;
}

/**
 * Campaign arc / "part" (#863): a named grouping the journal page files sessions
 * ("chapters") under so a long campaign stays navigable. Ordered by `position`
 * (story order → roman numeral I, II, III on the spine). Mirrors the backend
 * `serializeArc` shape.
 */
export interface CampaignArc {
  id: string;
  campaignId: string;
  name: string;
  position: number;
  createdAt: string;
}

/** Campaign entity registry & @-tagging (#248). */
export type EntityType = "NPC" | "LOCATION" | "FACTION" | "ITEM" | "PC" | "OTHER";

// DM reveal state (#379): non-owner members only ever see REVEALED entities.
export type EntityVisibility = "HIDDEN" | "REVEALED";

export interface CampaignEntity {
  id: string;
  campaignId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  notes: string | null;
  /** Optional portrait image URL (#844); monogram fallback when null/absent. */
  portraitUrl?: string | null;
  visibility: EntityVisibility;
  createdAt: string;
  updatedAt: string;
  /** Linked character for PC entities (#842); null elsewhere, list-route only. */
  characterId?: string | null;
  /** Which field a `q=` search hit (#839); present only on searched lists. */
  matchedIn?: EntityMatchField;
  /** Derived mention stats (#839); present only with `?include=stats`. */
  stats?: EntityStats;
}

export type EntityMatchField = "name" | "alias" | "notes";

/** Session context of a first/last mention; ordinal derived from startedAt order (#839). */
export interface EntityMentionRef {
  sessionId: string | null;
  sessionTitle: string | null;
  sessionOrdinal: number | null;
  date: string;
}

/** Per-entity derived mention stats (#839), visibility-filtered server-side. */
export interface EntityStats {
  mentionCount: number;
  firstMentioned: EntityMentionRef | null;
  lastMentioned: EntityMentionRef | null;
  chroniclers: string[];
  hasDescription: boolean;
}

/** One co-mentioned entity with its distinct-entry count (#839). */
export interface EntityConnection {
  entity: { id: string; name: string; type: EntityType };
  count: number;
}

/** One campaign-wide Codex activity item (#839), newest-first. */
export type CodexActivityItem =
  | {
      kind: "mention";
      characterName: string;
      entity: { id: string; name: string; type: EntityType };
      sessionOrdinal: number | null;
      date: string;
    }
  | {
      kind: "created";
      entity: { id: string; name: string; type: EntityType };
      date: string;
    };

/** One current holder of an awarded campaign item (#381). */
export interface CampaignItemHolder {
  characterId: string;
  characterName: string;
  quantity: number;
}

export interface CampaignItem {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  category: ItemCategory;
  /** Declared paper-doll slot for wearable gear (#571); absent = carried. */
  slot?: EquipSlot;
  rarity?: ItemRarity;
  requiresAttunement: boolean;
  attunementPrereqKind?: AttunementPrereqKind;
  attunementPrereqValue?: string;
  isUnique: boolean;
  weight?: number;
  cost?: Currency;
  dmNotes?: string;
  weapon?: WeaponDetail;
  armor?: ArmorDetail;
  consumable?: ConsumableDetail;
  capabilities?: ItemCapability[];

  /** The fronting ITEM CampaignEntity — its `visibility` drives player reveal. */
  entity?: { id: string; name: string; visibility: EntityVisibility };
  /** Current holders derived from live inventory rows (#381). */
  holders?: CampaignItemHolder[];
  createdAt: string;
  updatedAt: string;
}

/** Create/update body for a campaign item; detail block matches `category`. */
export interface CampaignItemInput {
  name: string;
  description?: string;
  category: ItemCategory;
  /** Worn-slot placement for gear; null clears it (mirrors backend #571). */
  slot?: EquipSlot | null;
  rarity?: ItemRarity;
  requiresAttunement?: boolean;
  /** null clears the prerequisite (attunable by anyone). */
  attunementPrereqKind?: AttunementPrereqKind | null;
  attunementPrereqValue?: string | null;
  isUnique?: boolean;
  weight?: number;
  cost?: Currency;
  dmNotes?: string;
  weapon?: WeaponDetailInput;
  armor?: ArmorDetailInput;
  consumable?: ConsumableDetail;
  /** REPLACE semantics server-side: the full set the item should have, [] clears. */
  capabilities?: ItemCapability[];

}

/** One note that @-tags an entity, surfaced on the entity detail page. */
export interface EntityBacklink {
  entry: {
    id: string;
    characterId: string;
    sessionId?: string | null;
    /** Session context (#839): title + startedAt-derived ordinal, null off-session. */
    sessionTitle?: string | null;
    sessionOrdinal?: number | null;
    kind: JournalEntryKind;
    title: string | null;
    date: string;
    loggedAt: string;
    body: string;
  };
  characterName: string;
  /** Which identity was tagged — a survivor unions its merged-in ids (#387). */
  identity: { id: string; name: string };
}

/** Entity identity merges (#387). */
export type MergeStatus = "PREPARED" | "EXECUTED";

/**
 * A non-destructive "revealed to be" link: `mergedEntity` (old identity) is the
 * same being as `survivorEntity` (true identity). PREPARED is the DM's secret
 * prep (never in a player payload); EXECUTED is the public reveal. Chains resolve
 * transitively (Jenkins→Vecna→Whispered One).
 */
export interface CampaignEntityMerge {
  id: string;
  campaignId: string;
  mergedEntityId: string;
  survivorEntityId: string;
  status: MergeStatus;
  note: string | null;
  preparedAt: string;
  executedAt: string | null;
}
