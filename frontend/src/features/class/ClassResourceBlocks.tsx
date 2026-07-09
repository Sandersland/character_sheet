import {
  applyChannelDivinityTransactions,
  applyConditionTransactions,
  applyDisciplineTransactions,
  applyResourceTransactions,
  applyShadowArtsTransactions,
} from "@/api/client";
import type {
  CastChannelDivinityOperation,
  CastDisciplineOperation,
  CastShadowArtOperation,
  Character,
  ForgetDisciplineOperation,
  LearnDisciplineOperation,
  LearnManeuverOperation,
  ResourceOperation,
  SwapDisciplineOperation,
} from "@/types/character";
import type { ClassFeatureView } from "@/lib/classFeatures";
import ChannelDivinitySection from "@/features/class/ChannelDivinitySection";
import CloakOfShadowsSection from "@/features/class/CloakOfShadowsSection";
import DisciplinesSection from "@/features/class/DisciplinesSection";
import ManeuversSection from "@/features/class/ManeuversSection";
import ResourcePoolsSection from "@/features/class/ResourcePoolsSection";
import ShadowArtsSection from "@/features/class/ShadowArtsSection";

interface Props {
  character: Character;
  view: ClassFeatureView;
  busy: boolean;
  run: (send: () => Promise<Character>) => void;
}

// The entitlement-gated resource/subclass feature blocks, split out of the
// orchestrator to keep each render function under the complexity budget.
export default function ClassResourceBlocks({ character, view, busy, run }: Props) {
  const resources = character.resources;

  const resourceOp = (
    op: LearnManeuverOperation | LearnDisciplineOperation | ForgetDisciplineOperation | SwapDisciplineOperation,
  ) => run(() => applyResourceTransactions(character.id, [op]));

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

      {view.hasDisciplines && (
        <DisciplinesSection
          character={character}
          choiceCount={resources!.disciplineChoiceCount!}
          saveDC={resources!.disciplineSaveDC}
          disciplinesKnown={resources!.disciplinesKnown ?? []}
          busy={busy}
          onCast={(op: CastDisciplineOperation) => run(() => applyDisciplineTransactions(character.id, [op]))}
          onLearn={(op) => resourceOp(op)}
          onForget={(op) => resourceOp(op)}
          onSwap={(op) => resourceOp(op)}
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
          busy={busy}
          onActivate={() => run(() => applyConditionTransactions(character.id, [{ type: "applyCondition", key: "invisible", source: "Cloak of Shadows" }]))}
        />
      )}
    </>
  );
}
