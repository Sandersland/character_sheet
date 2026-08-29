import Spinner from "@/components/ui/Spinner";
import AbilityAssignmentPanel from "@/features/character-create/AbilityAssignmentPanel";
import CreationEntryGate from "@/features/character-create/CreationEntryGate";
import CreationReviewStep from "@/features/character-create/CreationReviewStep";
import CreationSpellsStep from "@/features/character-create/CreationSpellsStep";
import IdentitySection from "@/features/character-create/IdentitySection";
import SkillSection from "@/features/character-create/SkillSection";
import SpeciesOriginFeatSection from "@/features/character-create/SpeciesOriginFeatSection";
import SpeciesSkillSection from "@/features/character-create/SpeciesSkillSection";
import StartingEquipmentSection from "@/features/character-create/StartingEquipmentSection";
import ToolProficiencySection from "@/features/character-create/ToolProficiencySection";
import { CeremonyCard, CeremonyStage, CeremonyFooter } from "@/features/ceremony/CeremonyShell";
import CeremonyStepRail from "@/features/ceremony/CeremonyStepRail";
import { useCharacterCreation, type CharacterCreation } from "@/hooks/useCharacterCreation";
import { CREATION_STEP_LABELS, type CreationStepKey } from "@/lib/creationSteps";
import type { ReferenceData } from "@/types/character";

interface StepBodyProps {
  c: CharacterCreation;
  reference: ReferenceData;
}

function IdentityStepBody({ c, reference }: StepBodyProps) {
  return (
    <IdentitySection
      draft={c.draft}
      update={c.update}
      reference={reference}
      portraitFile={c.portraitFile}
      onPortraitChange={c.setPortraitFile}
    />
  );
}

function AbilitiesStepBody({ c }: StepBodyProps) {
  return (
    <AbilityAssignmentPanel
      method={c.draft.abilityMethod}
      pool={c.draft.abilityPool}
      assignments={c.draft.abilityAssignments}
      scores={c.draft.abilityScores}
      bonuses={c.backgroundBonuses}
      speciesBonuses={c.speciesBonuses}
      primaryAbility={c.selections.class?.primaryAbility ?? []}
      className={c.draft.className}
      update={c.update}
    />
  );
}

function SkillsStepBody({ c }: StepBodyProps) {
  return (
    <>
      <SkillSection
        hasClass={Boolean(c.selections.class)}
        grantedSkills={c.skills.granted}
        options={c.skills.options}
        maxChoices={c.skills.max}
        selected={c.skills.selected}
        onToggle={c.skills.toggle}
      />
      {/* Renders only when the server serves a chooseSkills spec for the chosen
          species+variant (#1689/#1690). */}
      <SpeciesSkillSection choice={c.speciesSkillChoice} onToggle={c.speciesSkillChoice.toggle} />
      {/* Renders only when the server serves a chooseOriginFeat spec for the
          chosen species+variant (#1690). */}
      <SpeciesOriginFeatSection
        choice={c.speciesOriginFeatChoice}
        edition={c.draft.rulesEdition}
        onChange={(speciesOriginFeatId) => c.update({ speciesOriginFeatId })}
      />
      <ToolProficiencySection
        grantedToolProfs={c.toolChoices.grantedToolProfs}
        classChoices={c.toolChoices.classChoices}
        backgroundChoices={c.toolChoices.backgroundChoices}
      />
    </>
  );
}

function SpellsStepBody({ c }: StepBodyProps) {
  const picks = c.selections.class?.level1SpellPicks;
  // Narrowed to a required RulesEdition for the spell-catalog fetches below
  // (#1712); unreachable in practice since this step never renders before the
  // entry gate resolves it.
  const { rulesEdition } = c.draft;
  if (!rulesEdition) return null;
  // Species cantrip (when the server serves a chooseCantrip spec) and the
  // class's own cantrips/spells share one tabbed picker, so a non-caster High
  // Elf's species cantrip is still reachable even though `picks` is undefined
  // for it (#1689/#1778).
  return (
    <CreationSpellsStep
      className={c.draft.className}
      subclassId={c.draft.subclassId || undefined}
      counts={picks ?? undefined}
      cantripIds={c.draft.cantripIds}
      spellIds={c.draft.spellIds}
      speciesCantripChoice={c.speciesCantripChoice}
      edition={rulesEdition}
      onChange={c.update}
      onSpeciesCantripChange={(speciesCantripId) => c.update({ speciesCantripId })}
    />
  );
}

function EquipmentStepBody({ c }: StepBodyProps) {
  const startingEquipment = c.selections.class?.startingEquipment;
  const backgroundEquipment = c.selections.background?.startingEquipment;
  // boundToolCandidates must admit exactly what boundToolChoiceError admits —
  // dropping backgroundChoices.selected reintroduces an empty-dropdown bug for
  // a 2024 Soldier (#1565, #1779).
  const boundToolCandidates = [
    ...c.toolChoices.grantedToolProfs,
    ...c.toolChoices.classChoices.selected,
    ...c.toolChoices.backgroundChoices.selected,
  ];
  return (
    <>
      {!startingEquipment && (
        <p className="p-4 text-sm text-parchment-600">
          This class has no starting-equipment choices — you'll begin with an empty pack.
        </p>
      )}
      {startingEquipment && (
        <StartingEquipmentSection
          startingEquipment={startingEquipment}
          value={c.draft.equipmentDraft}
          catalog={c.catalog}
          onChange={(eq) => c.update({ equipmentDraft: eq })}
          selectedToolChoices={boundToolCandidates}
        />
      )}
      {backgroundEquipment && (
        <StartingEquipmentSection
          title="Background Equipment"
          kind="background"
          startingEquipment={backgroundEquipment}
          value={c.draft.backgroundEquipmentDraft}
          catalog={c.catalog}
          onChange={(eq) => c.update({ backgroundEquipmentDraft: eq })}
          selectedToolChoices={boundToolCandidates}
        />
      )}
    </>
  );
}

function ReviewStepBody({ c }: StepBodyProps) {
  return (
    <CreationReviewStep
      preview={c.preview}
      missing={c.missing}
      submitError={c.submitError}
      campaignName={c.draft.campaignName}
      rulesEdition={c.draft.rulesEdition}
    />
  );
}

const STEP_BODIES: Record<CreationStepKey, React.ComponentType<StepBodyProps>> = {
  identity: IdentityStepBody,
  abilities: AbilitiesStepBody,
  skills: SkillsStepBody,
  spells: SpellsStepBody,
  equipment: EquipmentStepBody,
  review: ReviewStepBody,
};

function ForgeLoadError() {
  return (
    <CeremonyStage layout="page">
      <CeremonyCard className="px-6 py-10 text-center">
        <h1 className="font-display text-2xl font-semibold text-parchment-900">Couldn't load the forge</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-parchment-600">
          Couldn't load races, classes, and backgrounds. Check that the backend is running and try refreshing.
        </p>
      </CeremonyCard>
    </CeremonyStage>
  );
}

function StartOverButton({ onClear }: { onClear: () => void }) {
  function handleStartOver() {
    if (window.confirm("Start over? This clears the draft saved on this device.")) onClear();
  }
  return (
    <button
      type="button"
      onClick={handleStartOver}
      className="text-[11px] font-semibold uppercase tracking-wide text-parchment-400 transition-colors hover:text-parchment-200"
    >
      Start over
    </button>
  );
}

export default function CreationCeremony() {
  const c = useCharacterCreation();

  // This early return only gates the JSX: useCharacterCreation()'s
  // useReferenceData query already ran above but skip-tokens while
  // draft.rulesEdition is null, so it won't fire early for a wrong/default
  // edition (#1286, #1325).
  if (c.draft.rulesEdition === null) {
    return (
      <CreationEntryGate
        onCancel={c.cancel}
        onResolved={({ campaignId, campaignName, rulesEdition }) =>
          c.update({ campaignId, campaignName, rulesEdition })
        }
      />
    );
  }

  if (c.referenceError) return <ForgeLoadError />;
  const reference = c.reference;
  if (!reference) return c.showSpinner ? <Spinner variant="page" /> : null;

  const StepBody = STEP_BODIES[c.currentStep];
  const name = c.draft.name.trim();

  return (
    <CeremonyStage layout="viewport">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">
          Forging{name ? ` · ${name}` : ""}
        </p>
        <StartOverButton onClear={c.clear} />
      </div>

      <CeremonyCard className="flex min-h-0 flex-1 flex-col px-5 py-6 sm:px-8">
        <div className="shrink-0">
          <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-parchment-500">
            Step {c.stepIndex + 1} of {c.steps.length} · {CREATION_STEP_LABELS[c.currentStep]}
          </p>
          <CeremonyStepRail
            steps={c.steps.map((key) => ({ key, label: CREATION_STEP_LABELS[key] }))}
            currentKey={c.currentStep}
          />
        </div>
        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-t border-parchment-200 pt-4">
          <StepBody c={c} reference={reference} />
        </div>
        <CeremonyFooter
          isFirst={c.stepIndex === 0}
          isLast={c.isLast}
          onCancel={c.cancel}
          onBack={c.back}
          onContinue={c.next}
          canContinue={c.canContinue}
          onConfirm={() => void c.save()}
          confirmLabel="✓ Create Character"
          confirmClassName="border-garnet-surface-hover bg-garnet-surface text-garnet-on-surface hover:bg-garnet-surface-hover"
          submitting={c.submitting}
          confirmDisabled={!c.isValid}
        />
      </CeremonyCard>
    </CeremonyStage>
  );
}
