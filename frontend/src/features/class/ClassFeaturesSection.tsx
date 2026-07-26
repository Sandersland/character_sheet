// ClassFeaturesSection — orchestrator for class feature interaction on the sheet.
// Owns busy/error via useClassTransactions, derives its view via deriveClassFeatureView,
// and composes per-feature subcomponents. Mirrors SpellsSection's orchestrator/row split.

import { applyAdvancementTransactions, applyClassTransactions } from "@/api/client";
import type { ClassOption } from "@/types/character";
import { deriveClassFeatureView } from "@/lib/classFeatures";
import { useClassTransactions } from "@/features/class/useClassTransactions";
import ClassFeaturesList from "@/features/class/ClassFeaturesList";
import ClassResourceBlocks from "@/features/class/ClassResourceBlocks";
import ClassRosterSection from "@/features/class/ClassRosterSection";
import FightingStyleFeatSection from "@/features/class/FightingStyleFeatSection";
import SubclassSection from "@/features/class/SubclassSection";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface Props {
  referenceClasses: ClassOption[];
}

export default function ClassFeaturesSection({ referenceClasses }: Props) {
  const { character } = useCurrentCharacter();
  const { busy, error, run } = useClassTransactions(character.id);
  const view = deriveClassFeatureView(character, referenceClasses);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      <ClassRosterSection rosterEntries={view.rosterEntries} />

      <SubclassSection
        classDef={view.classDef}
        needsSubclass={view.needsSubclass}
        busy={busy}
        onChoose={(subclassId) => run(() => applyClassTransactions(character.id, [{ type: "setSubclass", subclassId }]))}
      />

      <ClassResourceBlocks view={view} busy={busy} run={run} />

      {view.hasFightingStyle && (
        <FightingStyleFeatSection
          takenFeats={view.fightingStyleFeats}
          busy={busy}
          onTake={(op) => run(() => applyAdvancementTransactions(character.id, [op]))}
        />
      )}

      <ClassFeaturesList features={character.resources?.features ?? []} />

      {view.isEmpty && (
        <p className="py-4 text-center text-sm text-parchment-600">
          No class features available at this level.
        </p>
      )}
    </div>
  );
}
