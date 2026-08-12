import {
  applyActionTransactions,
  applyChannelDivinityTransactions,
  applyResourceTransactions,
  applyShadowArtsTransactions,
  applyWarriorOfElementsTransactions,
  castDisciplineTransaction,
} from "@/api/client";
import type {
  CastChannelDivinityOperation,
  CastShadowArtOperation,
  Character,
  DisciplineOperation,
  LearnManeuverOperation,
  ResourceOperation,
  ShadowArtOperation,
  WarriorOfElementsOperation,
} from "@/types/character";
import type { ClassFeatureView } from "@/lib/classFeatures";
import ChannelDivinitySection from "@/features/class/ChannelDivinitySection";
import CloakOfShadowsSection from "@/features/class/CloakOfShadowsSection";
import FourElementsSection from "@/features/class/FourElementsSection";
import ManeuversSection from "@/features/class/ManeuversSection";
import ResourcePoolsSection from "@/features/class/ResourcePoolsSection";
import ShadowArtsSection from "@/features/class/ShadowArtsSection";
import WarriorOfElementsSection from "@/features/class/WarriorOfElementsSection";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface Props {
  view: ClassFeatureView;
  busy: boolean;
  run: (send: () => Promise<Character>) => void;
}

// The entitlement-gated resource/subclass feature blocks, split out of the
// orchestrator to keep each render function under the complexity budget.
export default function ClassResourceBlocks({ view, busy, run }: Props) {
  const { character } = useCurrentCharacter();
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
          resources={resources!}
          maneuverSaveDC={character.maneuvers?.saveDC}
          maneuverKnownIds={view.maneuverKnownIds}
          busy={busy}
          onLearn={(op) => resourceOp(op)}
        />
      )}

      {view.hasElementsWarrior && (
        <WarriorOfElementsSection
          busy={busy}
          onOperations={(ops: WarriorOfElementsOperation[]) =>
            run(() => applyWarriorOfElementsTransactions(character.id, ops).then((r) => r.character))
          }
          // Elemental Attunement's own toggle is row-driven now (#1686) — a
          // plain executeAction op on the generic actions endpoint, not a
          // WarriorOfElementsOperation on this subclass's own endpoint.
          onToggleAttunement={(activate) =>
            run(() =>
              applyActionTransactions(character.id, [
                { type: "executeAction", actionKey: activate ? "elementalAttunement" : "endElementalAttunement" },
              ]),
            )
          }
        />
      )}

      {view.hasShadowArts && (
        <ShadowArtsSection
          busy={busy}
          onCast={(op: CastShadowArtOperation) => run(() => applyShadowArtsTransactions(character.id, [op]))}
        />
      )}

      {view.hasFourElements && (
        <FourElementsSection
          busy={busy}
          onCast={(op: DisciplineOperation) => run(() => castDisciplineTransaction(character.id, [op]))}
        />
      )}

      {view.hasChannelDivinity && (
        <ChannelDivinitySection
          busy={busy}
          onCast={(op: CastChannelDivinityOperation) => run(() => applyChannelDivinityTransactions(character.id, [op]))}
        />
      )}

      {view.hasCloakOfShadows && (
        <CloakOfShadowsSection
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
