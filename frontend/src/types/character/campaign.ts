import type { RulesEdition } from "@character-sheet/shared-types";

import type { ArmorDetail, ArmorDetailInput, AttunementPrereqKind, ConsumableDetail, EquipSlot, ItemCapability, ItemCategory, ItemRarity, WeaponDetail, WeaponDetailInput } from "./inventory";
import type { JournalEntryKind } from "./journal";
import type { Currency } from "./primitives";

/** Always present, both flags defaulting false, when the character is attached to a campaign; absent otherwise. */
export interface CampaignPreferences {
  shareWithDm: boolean;
  autoFriendlyHealing: boolean;
}

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
  /** Default edition for characters created here — never authoritative; `Character.rulesEdition` is. */
  rulesEdition: RulesEdition;
  /** Resolved server-side; always served, non-optional so a fixture can't silently omit it. */
  rulesEditionLabel: string;
  inviteCode: string;
  createdAt: string;
  members: CampaignMember[];
  /** Present on the detail route (`GET /api/campaigns/:id`) only. */
  characters?: { id: string; name: string; ownerId: string }[];
  role?: CampaignRole;
}

/** Ordered by `position`; mirrors backend `serializeArc`. */
export interface CampaignArc {
  id: string;
  campaignId: string;
  name: string;
  position: number;
  createdAt: string;
}

export type EntityType = "NPC" | "LOCATION" | "FACTION" | "ITEM" | "PC" | "OTHER";

// Non-owner members only ever see REVEALED entities.
export type EntityVisibility = "HIDDEN" | "REVEALED";

export interface CampaignEntity {
  id: string;
  campaignId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  notes: string | null;
  /** Monogram fallback when null/absent. */
  portraitUrl?: string | null;
  visibility: EntityVisibility;
  createdAt: string;
  updatedAt: string;
  /** null elsewhere; served on the list route only. */
  characterId?: string | null;
  /** null elsewhere; served on the list route and combine response only. */
  itemId?: string | null;
  /** Present only on searched lists. */
  matchedIn?: EntityMatchField;
  /** Present only with `?include=stats`. */
  stats?: EntityStats;
}

export type EntityMatchField = "name" | "alias" | "notes";

/** `sessionOrdinal` is derived from startedAt order. */
export interface EntityMentionRef {
  sessionId: string | null;
  sessionTitle: string | null;
  sessionOrdinal: number | null;
  date: string;
}

/** Visibility-filtered server-side. */
export interface EntityStats {
  mentionCount: number;
  firstMentioned: EntityMentionRef | null;
  lastMentioned: EntityMentionRef | null;
  chroniclers: string[];
  hasDescription: boolean;
}

export interface EntityConnection {
  entity: { id: string; name: string; type: EntityType };
  count: number;
}

/** Newest-first. */
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
  /** Absent = carried (not worn). */
  slot?: EquipSlot;
  rarity?: ItemRarity;
  requiresAttunement: boolean;
  attunementPrereqKind?: AttunementPrereqKind;
  attunementPrereqValue?: string;
  isUnique: boolean;
  weight?: number;
  cost?: Currency;
  /** Scrubbed server-side from every player response. */
  dmNotes?: string;
  weapon?: WeaponDetail;
  armor?: ArmorDetail;
  consumable?: ConsumableDetail;
  capabilities?: ItemCapability[];

  /** Its `visibility` drives player reveal. */
  entity?: { id: string; name: string; visibility: EntityVisibility };
  /** Derived live from inventory rows, not persisted. */
  holders?: CampaignItemHolder[];
  createdAt: string;
  updatedAt: string;
}

/** Detail block (weapon/armor/consumable) matches `category`. */
export interface CampaignItemInput {
  name: string;
  description?: string;
  category: ItemCategory;
  /** null clears it. */
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

export interface EntityBacklink {
  entry: {
    id: string;
    characterId: string;
    sessionId?: string | null;
    /** null when off-session. */
    sessionTitle?: string | null;
    sessionOrdinal?: number | null;
    kind: JournalEntryKind;
    title: string | null;
    date: string;
    loggedAt: string;
    body: string;
  };
  characterName: string;
  /** A survivor's id unions its merged-in identities' ids. */
  identity: { id: string; name: string };
}

export type MergeStatus = "PREPARED" | "EXECUTED";

/** PREPARED is the DM's secret prep (never in a player payload); EXECUTED is the public reveal. */
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

/** `kind` + `signature` together are the flag's stable identity for `POST /api/inbox/dismissals`. */
export interface InboxDuplicateEntity {
  id: string;
  name: string;
  type: EntityType;
  visibility: EntityVisibility;
  mentionCount: number;
}

export interface InboxDuplicateClusterRow {
  kind: "DUPLICATE_CLUSTER";
  campaignId: string;
  campaignName: string;
  signature: string;
  entities: InboxDuplicateEntity[];
  /** Most-mentioned entity, oldest as tiebreak — the pre-selected keeper in the combine UI. */
  defaultSurvivorId: string;
  /** ISO timestamp this row was sorted by. */
  signalAt: string;
}

export interface InboxNeedsChroniclingRow {
  kind: "NEEDS_CHRONICLING";
  campaignId: string;
  campaignName: string;
  signature: string;
  /** Entities with >=1 mention and no description in this campaign. */
  count: number;
  /** ISO timestamp this row was sorted by. */
  signalAt: string;
}

export type InboxRow = InboxDuplicateClusterRow | InboxNeedsChroniclingRow;
