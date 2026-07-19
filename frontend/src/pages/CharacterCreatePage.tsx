import { Link } from "react-router-dom";

import AbilityScoresSection from "@/features/character-create/AbilityScoresSection";
import BackendStatus from "@/features/character-meta/BackendStatus";
import BackgroundBonusesSection from "@/features/character-create/BackgroundBonusesSection";
import Card from "@/components/ui/Card";
import CreateActions from "@/features/character-create/CreateActions";
import IdentitySection from "@/features/character-create/IdentitySection";
import PreviewSection from "@/features/character-create/PreviewSection";
import SkillSection from "@/features/character-create/SkillSection";
import Spinner from "@/components/ui/Spinner";
import StartingEquipmentSection from "@/features/character-create/StartingEquipmentSection";
import ToolProficiencySection from "@/features/character-create/ToolProficiencySection";
import { useCharacterCreation } from "@/hooks/useCharacterCreation";

export default function CharacterCreatePage() {
  const create = useCharacterCreation();
  const {
    reference,
    referenceError,
    showSpinner,
    draft,
    update,
    clear,
    selections,
    skills,
    toolChoices,
    backgroundBonuses,
    catalog,
    preview,
    missing,
    isValid,
    submitting,
    submitError,
    save,
  } = create;

  function handleStartOver() {
    if (window.confirm("Start over? This clears the draft saved on this device.")) {
      clear();
    }
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      <div className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <Link to="/" className="text-xs font-semibold text-garnet-700 hover:underline">
              ← All characters
            </Link>
            <h1 className="mt-1 font-display text-3xl font-semibold text-parchment-900">
              New Character
            </h1>
            <p className="mt-1 text-sm text-parchment-600">
              Fill in what you know now — your progress is saved on this device
              until you press Save.
            </p>
          </div>
          <BackendStatus />
        </div>
      </div>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        {referenceError ? (
          <Card className="p-4">
            <p className="text-sm text-garnet-700">
              Couldn't load races/classes/backgrounds. Check that the backend is
              running and try refreshing.
            </p>
          </Card>
        ) : !reference ? (
          showSpinner ? <Spinner className="py-16" /> : null
        ) : (
          <>
            <IdentitySection draft={draft} update={update} reference={reference} />

            <AbilityScoresSection draft={draft} update={update} />

            {backgroundBonuses.applicable ? (
              <BackgroundBonusesSection
                bonuses={backgroundBonuses}
                onChange={(assignment) => update({ backgroundAbilities: assignment })}
              />
            ) : null}

            <SkillSection
              hasClass={Boolean(selections.class)}
              grantedSkills={skills.granted}
              options={skills.options}
              maxChoices={skills.max}
              selected={skills.selected}
              onToggle={skills.toggle}
            />

            <ToolProficiencySection
              grantedToolProfs={toolChoices.grantedToolProfs}
              toolChoiceOptions={toolChoices.toolChoiceOptions}
              maxToolChoices={toolChoices.maxToolChoices}
              selectedToolChoices={toolChoices.selectedToolChoices}
              toggleToolChoice={toolChoices.toggleToolChoice}
            />

            <StartingEquipmentSection
              startingEquipment={selections.class?.startingEquipment}
              value={draft.equipmentDraft}
              catalog={catalog}
              onChange={(eq) => update({ equipmentDraft: eq })}
            />

            <PreviewSection
              armorClass={preview.armorClass}
              dexModifier={preview.dexModifier}
              speed={preview.speed}
              maxHp={preview.maxHp}
            />

            <CreateActions
              isValid={isValid}
              submitting={submitting}
              submitError={submitError}
              missing={missing}
              onSave={save}
              onStartOver={handleStartOver}
            />
          </>
        )}
      </main>
    </div>
  );
}
