/**
 * Shared scaffolding for the Monk ki-cast handlers (disciplines, shadow-arts).
 * Both wrap castAbilityInTx with an identical character-select and audit-event
 * tail; only their 5e rules (effect specs, level gates, ki costs) differ and stay
 * in their own files. Full unification of those divergent parts is the job of the
 * declarative subclass engine (#416) — this module only removes the byte-for-byte
 * clone (fallow dup:a64b5a27).
 */

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent, type EventType } from "@/lib/activity/events.js";
import { snapshotSpellcasting, type SpellcastingMutableState } from "@/lib/spellcasting/spell-state.js";

/**
 * Character columns both ki-cast handlers re-read per op. The per-subclass 5e
 * rules (ki caps, concentration sets, effect specs) live in their own files, not
 * here — this is only the shared DB projection.
 */
export const KI_CAST_CHARACTER_SELECT = {
  spellcasting: true,
  resources: true,
  experiencePoints: true,
  abilityScores: true,
  // Every entry (not just the primary) + its level, so a non-primary Monk's
  // ki/disciplineSaveDC still resolves via deriveEntryScopedResources (#1072).
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, subclass: true, level: true },
  },
} satisfies Prisma.CharacterSelect;

/** The character row shape both ki-cast handlers receive (from KI_CAST_CHARACTER_SELECT). */
export type KiCastCharacterRow = Prisma.CharacterGetPayload<{ select: typeof KI_CAST_CHARACTER_SELECT }>;

/** The two audit-event `type`s emitted by the shared ki-cast tail. */
type KiCastEventType = Extract<EventType, "castDiscipline" | "castShadowArt">;

export interface EmitKiCastEventsParams {
  characterId: string;
  batchId: string;
  sessionId: string | null;
  eventType: KiCastEventType;
  /** Whether the cast established concentration (drives the write-back + spellcasting event). */
  concentrates: boolean;
  /** Live post-cast spellcasting state — persisted + snapshotted when concentrating. */
  spellState: SpellcastingMutableState;
  /** Snapshot taken BEFORE the cast mutated `spellState`. */
  beforeSpell: ReturnType<typeof snapshotSpellcasting>;
  /** Ability name for the "Concentrating on <name>" summary. */
  concentrationName: string;
  /** `data` payload for the spellcasting-category concentration event. */
  concentrationData: Record<string, unknown>;
  /** Summary + `data` for the resources-category cast record. */
  resourceSummary: string;
  resourceData: Record<string, unknown>;
}

/**
 * Emit the shared audit tail for a ki cast: when the ability concentrates, persist
 * the spellcasting write-back and log the undoable spellcasting-category event
 * (before/after snapshots restore `concentratingOn` on revert); always log the
 * resources-category cast record. Payloads stay byte-identical across both handlers
 * — pinned by the disciplines-cast / shadow-arts-cast characterization tests.
 */
export async function emitKiCastEvents(
  tx: Prisma.TransactionClient,
  params: EmitKiCastEventsParams,
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
