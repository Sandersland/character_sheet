import {
  applyChannelDivinityTransactions,
  applyResourceTransactions,
  applyShadowArtsTransactions,
  applyWarriorOfElementsTransactions,
} from "@/api/client";
import type {
  CastChannelDivinityOperation,
  CastShadowArtOperation,
  Character,
  LearnManeuverOperation,
  ResourceOperation,
  ShadowArtOperation,
  WarriorOfElementsOperation,
} from "@/types/character";
import type { ClassFeatureView } from "@/lib/classFeatures";
import ChannelDivinitySection from "@/features/class/ChannelDivinitySection";
import CloakOfShadowsSection from "@/features/class/CloakOfShadowsSection";
import ManeuversSection from "@/features/class/ManeuversSection";
import ResourcePoolsSection from "@/features/class/ResourcePoolsSection";
import ShadowArtsSection from "@/features/class/ShadowArtsSection";
import WarriorOfElementsSection from "@/features/class/WarriorOfElementsSection";

interface Props {
  character: Character;
  view: ClassFeatureView;
  busy: boolean;
  run: (send: () => Promise<Character>) => void;
}

// Remaining Focus from the character's derived resource pools — mirrors the
// identical local helper in ShadowArtsSection/WarriorOfElementsSection.
function focusRemaining(character: Character): number {
  return character.resources?.pools.find((p) => p.key === "focus")?.remaining ?? 0;
}

// The entitlement-gated resource/subclass feature blocks, split out of the
// orchestrator to keep each render function under the complexity budget.
export default function ClassResourceBlocks({ character, view, busy, run }: Props) {
  const resources = character.resources;

  const resourceOp = (op: LearnManeuverOperation) => run(() => applyResourceTransactions(character.id, [op]));

  return (
    <>
      {view.hasPools && (
        <ResourcePoolsSection
          characterId={character.id}
          pools={resources!.pools}
          busy={busy}
          onOperations={(ops: ResourceOperation[]) => run(() => applyResourceTransactions(character.id, ops))}
        />
      )}

      {view.hasManeuvers && (
        <ManeuversSection
          characterId={character.id}
          resources={resources!}
          maneuverKnownIds={view.maneuverKnownIds}
          busy={busy}
          onLearn={(op) => resourceOp(op)}
          onForget={(entryId) => run(() => applyResourceTransactions(character.id, [{ type: "forgetManeuver", entryId }]))}
        />
      )}

      {view.hasElementsWarrior && (
        <WarriorOfElementsSection
          character={character}
          busy={busy}
          onOperations={(ops: WarriorOfElementsOperation[]) =>
            run(() => applyWarriorOfElementsTransactions(character.id, ops).then((r) => r.character))
          }
        />
      )}

      {view.hasShadowArts && (
        <ShadowArtsSection
          character={character}
          busy={busy}
          onCast={(op: CastShadowArtOperation) => run(() => applyShadowArtsTransactions(character.id, [op]))}
        />
      )}

      {view.hasChannelDivinity && (
        <ChannelDivinitySection
          character={character}
          busy={busy}
          onCast={(op: CastChannelDivinityOperation) => run(() => applyChannelDivinityTransactions(character.id, [op]))}
        />
      )}

      {view.hasCloakOfShadows && (
        <CloakOfShadowsSection
          character={character}
          focusAvailable={focusRemaining(character)}
          busy={busy}
          onActivate={() =>
            run(() =>
              applyShadowArtsTransactions(character.id, [
                { type: "activateCloakOfShadows" } satisfies ShadowArtOperation,
              ]),
            )
          }
        />
      )}
    </>
  );
}
