// The full-screen level-up ceremony (#886) over the shared ceremony chrome
// (#1176): dark stage, parchment double-rule card, the adaptive step rail, a
// step-body slot, and the Cancel/Back/Continue footer that flips to Confirm.

import Spinner from "@/components/ui/Spinner";
import { CeremonyCard, CeremonyFooter, CeremonyStage, GHOST_BTN } from "@/features/ceremony/CeremonyShell";
import CeremonyStepRail from "@/features/ceremony/CeremonyStepRail";
import AbilityScoreStep from "@/features/level-up/AbilityScoreStep";
import ChoiceStep from "@/features/level-up/ChoiceStep";
import ClassChoiceStep from "@/features/level-up/ClassChoiceStep";
import HitPointsStep from "@/features/level-up/HitPointsStep";
import LevelUpStepPlaceholder from "@/features/level-up/LevelUpStepPlaceholder";
import NewSpellsStep from "@/features/level-up/NewSpellsStep";
import ReviewStep from "@/features/level-up/ReviewStep";
import SubclassStep from "@/features/level-up/SubclassStep";
import {
  useLevelUpCeremony,
  type LevelAgainPhase,
  type LevelUpCeremony as Ceremony,
} from "@/features/level-up/useLevelUpCeremony";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { stepKey, stepLabel } from "@/lib/levelUpSteps";
import type { Character, LevelUpStep, LevelUpStepKind, LevelUpTarget } from "@/types/character";

// Step-body slot: #887–#891 register their real bodies per kind here; anything
// unregistered renders the placeholder.
const STEP_BODIES: Partial<Record<LevelUpStepKind, React.ComponentType<{ step: LevelUpStep }>>> = {
  hitPoints: HitPointsStep,
  advancement: AbilityScoreStep,
  maneuvers: ChoiceStep,
  fightingStyleFeat: ChoiceStep,
  toolProficiency: ChoiceStep,
  subclass: SubclassStep,
  newSpells: NewSpellsStep,
  review: ReviewStep,
};

function StepBody({ step }: { step: LevelUpStep }) {
  const Body = STEP_BODIES[step.kind] ?? LevelUpStepPlaceholder;
  return <Body step={step} />;
}

function PaperNotice({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <CeremonyCard className="px-6 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold text-parchment-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-parchment-600">{body}</p>
      <button type="button" onClick={onBack} className={`${GHOST_BTN} mt-6`}>
        Back to sheet
      </button>
    </CeremonyCard>
  );
}

// #1170: shown after Confirm when pendingLevelUps remain — BG3-style per-level
// choice loops back to the class chooser instead of leaving the ceremony.
function LevelAgainNotice({ remaining, onContinue, onFinish }: LevelAgainPhase) {
  return (
    <CeremonyCard className="px-6 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold text-parchment-900">Level applied!</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-parchment-600">
        {remaining > 1
          ? `You have ${remaining} more advancements waiting.`
          : "You have one more advancement waiting."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={onFinish} className={GHOST_BTN}>
          Finish for now
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="min-h-11 rounded-control border border-vitality-700 bg-vitality-700 px-5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-vitality-800"
        >
          Level up again ›
        </button>
      </div>
    </CeremonyCard>
  );
}

function CeremonyHeader({ target }: { target: NonNullable<Ceremony["plan"]>["target"] }) {
  return (
    <header className="text-center">
      <p aria-hidden className="pl-[0.5em] text-[15px] tracking-[0.5em] text-gold-500">
        ✦───✦───✦
      </p>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-parchment-500">
        {target.className}
        {target.subclass ? ` · ${target.subclass}` : ""}
      </p>
      <h1 className="mt-1 font-display text-4xl font-bold text-garnet-800">
        Level <span className="text-xl font-semibold text-gold-700">{target.newLevel - 1} →</span> {target.newLevel}
      </h1>
    </header>
  );
}

type CeremonyPhase =
  | { kind: "loading" }
  | { kind: "classChoice"; classChoice: NonNullable<Ceremony["classChoice"]> }
  | { kind: "levelAgain"; levelAgain: NonNullable<Ceremony["levelAgain"]> }
  | { kind: "notice"; planError: string }
  | { kind: "ready"; plan: NonNullable<Ceremony["plan"]>; currentStep: LevelUpStep; target: LevelUpTarget };

// Reduces the ceremony hook's flat field set to one of five mutually exclusive
// render phases, so the component below picks a branch instead of re-deriving it.
function ceremonyPhase(c: Ceremony): CeremonyPhase {
  if (c.classChoice) return { kind: "classChoice", classChoice: c.classChoice };
  if (c.levelAgain) return { kind: "levelAgain", levelAgain: c.levelAgain };
  if (c.plan && c.currentStep && c.target && !c.planError) {
    return { kind: "ready", plan: c.plan, currentStep: c.currentStep, target: c.target };
  }
  if (c.planError) return { kind: "notice", planError: c.planError };
  return { kind: "loading" };
}

function ReadyStep({
  character,
  c,
  plan,
  currentStep,
  target,
}: {
  character: Character;
  c: Ceremony;
  plan: NonNullable<Ceremony["plan"]>;
  currentStep: LevelUpStep;
  target: LevelUpTarget;
}) {
  return (
    <CeremonyCard className="flex min-h-0 flex-1 flex-col px-5 py-7 sm:px-10">
      <div className="shrink-0">
        <CeremonyHeader target={plan.target} />
        <div className="mt-5">
          <CeremonyStepRail
            steps={c.steps.map((s) => ({ key: stepKey(s), label: stepLabel(s) }))}
            currentKey={c.currentKey}
          />
        </div>
      </div>
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-parchment-200 pt-4">
        <LevelUpStepContext.Provider value={{ character, draft: c.draft, setDraft: c.setDraft, plan, target }}>
          <StepBody step={currentStep} />
        </LevelUpStepContext.Provider>
      </div>
      {c.submitError && (
        <p role="alert" className="mt-2 text-center text-sm font-semibold text-garnet-700">
          {c.submitError}
        </p>
      )}
      <CeremonyFooter
        isFirst={c.stepIndex === 0}
        isLast={c.isLast}
        onCancel={c.cancel}
        onBack={c.back}
        onContinue={c.next}
        canContinue={c.canContinue}
        onConfirm={() => void c.confirm()}
        confirmLabel="✓ Confirm Level Up"
        confirmClassName="border-vitality-700 bg-vitality-700 hover:bg-vitality-800"
        submitting={c.submitting}
      />
    </CeremonyCard>
  );
}

interface Props {
  character: Character;
  /** Refreshes the sheet's character after a "level up again" loop (#1170) — the
   *  next iteration's steps (HP max, dropped die, etc.) must see the applied level. */
  onCharacterChange?: (updated: Character) => void;
}

export default function LevelUpCeremony({ character, onCharacterChange }: Props) {
  const c = useLevelUpCeremony(character, onCharacterChange);
  const showSpinner = useDelayedFlag(c.plan === null && !c.planError);
  const phase = ceremonyPhase(c);

  // Loading renders bare (no stage chrome) — matches CreationCeremony so a slow
  // plan fetch doesn't flash the dark stage before there's anything to show on it.
  if (phase.kind === "loading") return showSpinner ? <Spinner variant="page" /> : null;

  if (phase.kind === "classChoice") {
    return (
      <CeremonyStage layout="viewport">
        <ClassChoiceStep
          options={phase.classChoice.options}
          initialTarget={phase.classChoice.initialTarget}
          onContinue={phase.classChoice.onChoose}
          onCancel={c.cancel}
        />
      </CeremonyStage>
    );
  }

  if (phase.kind === "levelAgain") {
    return (
      <CeremonyStage layout="page">
        <LevelAgainNotice {...phase.levelAgain} />
      </CeremonyStage>
    );
  }

  if (phase.kind === "notice") {
    return (
      <CeremonyStage layout="page">
        <PaperNotice title="The ceremony can't begin" body={phase.planError} onBack={c.cancel} />
      </CeremonyStage>
    );
  }

  return (
    <CeremonyStage layout="viewport">
      <p className="mb-3 shrink-0 text-center text-[11px] font-bold uppercase tracking-widest text-gold-400">
        Step {c.stepIndex + 1} of {c.steps.length}
      </p>
      <ReadyStep character={character} c={c} plan={phase.plan} currentStep={phase.currentStep} target={phase.target} />
    </CeremonyStage>
  );
}
