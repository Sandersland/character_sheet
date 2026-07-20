// The full-screen character-creation ceremony (#1176) over the shared ceremony
// chrome: a viewport-pinned rail + footer with the current step's body scrolling
// between them. Each step body reuses its existing section component.

import Spinner from "@/components/ui/Spinner";
import AbilityAssignmentPanel from "@/features/character-create/AbilityAssignmentPanel";
import CreationReviewStep from "@/features/character-create/CreationReviewStep";
import IdentitySection from "@/features/character-create/IdentitySection";
import SkillSection from "@/features/character-create/SkillSection";
import SpellSelectionSection from "@/features/character-create/SpellSelectionSection";
import StartingEquipmentSection from "@/features/character-create/StartingEquipmentSection";
import ToolProficiencySection from "@/features/character-create/ToolProficiencySection";
import { CeremonyCard, CeremonyStage, CeremonyFooter } from "@/features/ceremony/CeremonyShell";
import CeremonyStepRail from "@/features/ceremony/CeremonyStepRail";
import { useCharacterCreation } from "@/hooks/useCharacterCreation";
import { CREATION_STEP_LABELS } from "@/lib/creationSteps";

export default function CreationCeremony() {
  const c = useCharacterCreation();

  function handleStartOver() {
    if (window.confirm("Start over? This clears the draft saved on this device.")) c.clear();
  }

  if (c.referenceError) {
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

  const reference = c.reference;
  if (!reference) return c.showSpinner ? <Spinner variant="page" /> : null;

  let body: React.ReactNode;
  switch (c.currentStep) {
    case "identity":
      body = <IdentitySection draft={c.draft} update={c.update} reference={reference} />;
      break;
    case "abilities":
      body = (
        <AbilityAssignmentPanel
          method={c.draft.abilityMethod}
          pool={c.draft.abilityPool}
          assignments={c.draft.abilityAssignments}
          scores={c.draft.abilityScores}
          bonuses={c.backgroundBonuses}
          primaryAbility={c.selections.class?.primaryAbility ?? []}
          className={c.draft.className}
          update={c.update}
        />
      );
      break;
    case "skills":
      body = (
        <>
          <SkillSection
            hasClass={Boolean(c.selections.class)}
            grantedSkills={c.skills.granted}
            options={c.skills.options}
            maxChoices={c.skills.max}
            selected={c.skills.selected}
            onToggle={c.skills.toggle}
          />
          <ToolProficiencySection
            grantedToolProfs={c.toolChoices.grantedToolProfs}
            toolChoiceOptions={c.toolChoices.toolChoiceOptions}
            maxToolChoices={c.toolChoices.maxToolChoices}
            selectedToolChoices={c.toolChoices.selectedToolChoices}
            toggleToolChoice={c.toolChoices.toggleToolChoice}
          />
        </>
      );
      break;
    case "spells":
      body = c.selections.class?.level1SpellPicks ? (
        <SpellSelectionSection
          className={c.draft.className}
          counts={c.selections.class.level1SpellPicks}
          cantripIds={c.draft.cantripIds}
          spellIds={c.draft.spellIds}
          onChange={c.update}
        />
      ) : null;
      break;
    case "equipment":
      body = c.selections.class?.startingEquipment ? (
        <StartingEquipmentSection
          startingEquipment={c.selections.class.startingEquipment}
          value={c.draft.equipmentDraft}
          catalog={c.catalog}
          onChange={(eq) => c.update({ equipmentDraft: eq })}
        />
      ) : (
        <p className="p-4 text-sm text-parchment-600">
          This class has no starting-equipment choices — you'll begin with an empty pack.
        </p>
      );
      break;
    case "review":
      body = <CreationReviewStep preview={c.preview} missing={c.missing} submitError={c.submitError} />;
      break;
  }

  const name = c.draft.name.trim();
  return (
    <CeremonyStage layout="viewport">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">
          Forging{name ? ` · ${name}` : ""}
        </p>
        <button
          type="button"
          onClick={handleStartOver}
          className="text-[11px] font-semibold uppercase tracking-wide text-parchment-400 transition-colors hover:text-parchment-200"
        >
          Start over
        </button>
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
          {body}
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
          confirmClassName="border-garnet-800 bg-garnet-700 hover:bg-garnet-800"
          submitting={c.submitting || !c.isValid}
        />
      </CeremonyCard>
    </CeremonyStage>
  );
}
