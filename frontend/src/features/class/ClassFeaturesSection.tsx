// ClassFeaturesSection — orchestrator for class feature interaction on the sheet.
// Owns busy/error via useClassTransactions, derives its view via deriveClassFeatureView,
// and composes per-feature subcomponents. Mirrors SpellsSection's orchestrator/row split.

import { applyClassTransactions } from "@/api/client";
import type { AddClassOperation, Character, ClassOption, FightingStyleKey } from "@/types/character";
import { deriveClassFeatureView } from "@/lib/classFeatures";
import { useClassTransactions } from "@/features/class/useClassTransactions";
import ClassFeaturesList from "@/features/class/ClassFeaturesList";
import ClassResourceBlocks from "@/features/class/ClassResourceBlocks";
import ClassRosterSection from "@/features/class/ClassRosterSection";
import FightingStyleSection from "@/features/class/FightingStyleSection";
import SubclassSection from "@/features/class/SubclassSection";

interface Props {
  character: Character;
  referenceClasses: ClassOption[];
  onUpdate: (updated: Character) => void;
}

export default function ClassFeaturesSection({ character, referenceClasses, onUpdate }: Props) {
  const { busy, error, run } = useClassTransactions(onUpdate);
  const view = deriveClassFeatureView(character, referenceClasses);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      <ClassRosterSection
        character={character}
        referenceClasses={referenceClasses}
        rosterEntries={view.rosterEntries}
        busy={busy}
        onAddClass={(op: AddClassOperation) => run(() => applyClassTransactions(character.id, [op]))}
      />

      <SubclassSection
        character={character}
        classDef={view.classDef}
        needsSubclass={view.needsSubclass}
        busy={busy}
        onChoose={(subclassId) => run(() => applyClassTransactions(character.id, [{ type: "setSubclass", subclassId }]))}
      />

      <ClassResourceBlocks character={character} view={view} busy={busy} run={run} />

      {view.hasFightingStyle && (
        <FightingStyleSection
          fightingStyle={view.fightingStyle}
          busy={busy}
          onChoose={(key: FightingStyleKey) => run(() => applyClassTransactions(character.id, [{ type: "setFightingStyle", key }]))}
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
