import { Prisma } from "@/generated/prisma/client.js";
import { logEvent, type EventType } from "@/lib/activity/events.js";
import { snapshotSpellcasting, type SpellcastingMutableState } from "@/lib/spellcasting/spell-state.js";
import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES } from "./feature-rows-select.js";

export const FOCUS_CAST_CHARACTER_SELECT = {
  spellcasting: true,
  resources: true,
  experiencePoints: true,
  abilityScores: true,
  rulesEdition: true,
  // Every entry (not just primary) + its level, so a non-primary Monk's focus gate still resolves via deriveEntryScopedResources; subclassRef.slug is what the cast guards resolve subclass identity through (resolveSubclassSlug).
  // class.features/subclassRef.features are the UNFOLDED FEATURE_ROWS_CLASS_FEATURES/FEATURE_ROWS_SUBCLASS_FEATURES fragments, not folded FEATURE_ROWS_ENTRY_SELECT (which collides with this select's own subclassRef.slug). WARRIOR_OF_ELEMENTS_SELECT is the shipped precedent this copies.
  // Without this relation, a monk row moved onto ClassFeature is invisible to the Shadow Arts/discipline cast guards even though the wire still shows its card.
  classEntries: {
    orderBy: { position: "asc" as const },
    select: {
      name: true,
      subclass: true,
      level: true,
      subclassRef: { select: { slug: true, features: FEATURE_ROWS_SUBCLASS_FEATURES } },
      class: { select: { subclassLevel: true, features: FEATURE_ROWS_CLASS_FEATURES } },
    },
  },
} satisfies Prisma.CharacterSelect;

type FocusCastEventType = Extract<EventType, "castShadowArt" | "castDiscipline">;

export interface EmitFocusCastEventsParams {
  characterId: string;
  batchId: string;
  sessionId: string | null;
  eventType: FocusCastEventType;
  concentrates: boolean;
  // Live post-cast spellcasting state — persisted + snapshotted when concentrating.
  spellState: SpellcastingMutableState;
  // Snapshot taken BEFORE the cast mutated `spellState`.
  beforeSpell: ReturnType<typeof snapshotSpellcasting>;
  concentrationName: string;
  concentrationData: Record<string, unknown>;
  resourceSummary: string;
  resourceData: Record<string, unknown>;
}

// Before/after snapshots restore concentratingOn on revert when the ability concentrates; the resources-category record always logs.
// Payload shapes are pinned by the shadow-arts-cast characterization tests — changing them may require updating those tests.
export async function emitFocusCastEvents(
  tx: Prisma.TransactionClient,
  params: EmitFocusCastEventsParams,
): Promise<void> {
  const {
    characterId, batchId, sessionId, eventType,
    concentrates, spellState, beforeSpell, concentrationName,
    concentrationData, resourceSummary, resourceData,
  } = params;

  if (concentrates) {
    await tx.character.update({
      where: { id: characterId },
      data: {
        spellcasting: {
          slotsUsed: spellState.slotsUsed,
          arcanumUsed: spellState.arcanumUsed,
          spells: spellState.spells,
          concentratingOn: spellState.concentratingOn,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await logEvent(tx, {
      characterId,
      category: "spellcasting",
      type: eventType,
      summary: `Concentrating on ${concentrationName}`,
      before: beforeSpell,
      after: snapshotSpellcasting(spellState),
      data: concentrationData,
      batchId,
      sessionId,
    });
  }

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: eventType,
    summary: resourceSummary,
    data: resourceData,
    batchId,
    sessionId,
  });
}
