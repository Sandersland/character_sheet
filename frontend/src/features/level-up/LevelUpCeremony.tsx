// The full-screen level-up ceremony (#886) over the shared ceremony chrome
// (#1176): dark stage, parchment double-rule card, the adaptive step rail, a
// step-body slot, and the Cancel/Back/Continue footer that flips to Confirm.

import Spinner from "@/components/ui/Spinner";
import { CeremonyCard, CeremonyFooter, CeremonyStage, GHOST_BTN } from "@/features/ceremony/CeremonyShell";
import CeremonyStepRail from "@/features/ceremony/CeremonyStepRail";
import AbilityScoreStep from "@/features/level-up/AbilityScoreStep";
import ChoiceStep from "@/features/level-up/ChoiceStep";
import HitPointsStep from "@/features/level-up/HitPointsStep";
import LevelUpStepPlaceholder from "@/features/level-up/LevelUpStepPlaceholder";
import NewSpellsStep from "@/features/level-up/NewSpellsStep";
import ReviewStep from "@/features/level-up/ReviewStep";
import SubclassStep from "@/features/level-up/SubclassStep";
import { useLevelUpCeremony, type LevelUpCeremony as Ceremony } from "@/features/level-up/useLevelUpCeremony";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { stepKey, stepLabel } from "@/lib/levelUpSteps";
import type { Character, LevelUpStep, LevelUpStepKind } from "@/types/character";

// Step-body slot: #887–#891 register their real bodies per kind here; anything
// unregistered renders the placeholder.
const STEP_BODIES: Partial<Record<LevelUpStepKind, React.ComponentType<{ step: LevelUpStep }>>> = {
  hitPoints: HitPointsStep,
  advancement: AbilityScoreStep,
  maneuvers: ChoiceStep,
  fightingStyleFeat: ChoiceStep,
  toolProficiency: ChoiceStep,
  disciplines: ChoiceStep,
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

function NoticeCard({ c }: { c: Ceremony }) {
  if (c.planError) {
    return <PaperNotice title="The ceremony can't begin" body={c.planError} onBack={c.cancel} />;
  }
  return (
    <PaperNotice
      title="Not supported here yet"
      body="This level grants subclass feature picks (maneuvers, disciplines, or similar) that can't be resolved for a non-primary class yet — use the classic Level Up on the sheet."
      onBack={c.cancel}
    />
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
  | { kind: "notice" }
  | { kind: "ready"; plan: NonNullable<Ceremony["plan"]>; currentStep: LevelUpStep };

// Reduces the ceremony hook's flat field set to one of three mutually exclusive
// render phases, so the component below picks a branch instead of re-deriving it.
function ceremonyPhase(c: Ceremony): CeremonyPhase {
  if (c.plan && c.currentStep && !c.planError && !c.blocked) {
    return { kind: "ready", plan: c.plan, currentStep: c.currentStep };
  }
  if (c.planError || c.blocked) return { kind: "notice" };
  return { kind: "loading" };
}

function ReadyStep({ character, c, plan, currentStep }: { character: Character; c: Ceremony; plan: NonNullable<Ceremony["plan"]>; currentStep: LevelUpStep }) {
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
        <LevelUpStepContext.Provider value={{ character, draft: c.draft, setDraft: c.setDraft, plan }}>
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

export default function LevelUpCeremony({ character }: { character: Character }) {
  const c = useLevelUpCeremony(character);
  const showSpinner = useDelayedFlag(c.plan === null && !c.planError);
  const phase = ceremonyPhase(c);

  // Loading renders bare (no stage chrome) — matches CreationCeremony so a slow
  // plan fetch doesn't flash the dark stage before there's anything to show on it.
  if (phase.kind === "loading") return showSpinner ? <Spinner variant="page" /> : null;

  if (phase.kind === "notice") {
    return (
      <CeremonyStage layout="page">
        <NoticeCard c={c} />
      </CeremonyStage>
    );
  }

  return (
    <CeremonyStage layout="viewport">
      <p className="mb-3 shrink-0 text-center text-[11px] font-bold uppercase tracking-widest text-gold-400">
        Step {c.stepIndex + 1} of {c.steps.length}
      </p>
      <ReadyStep character={character} c={c} plan={phase.plan} currentStep={phase.currentStep} />
    </CeremonyStage>
  );
}
