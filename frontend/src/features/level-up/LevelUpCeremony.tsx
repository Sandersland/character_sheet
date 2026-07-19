// The full-screen level-up ceremony shell (#886): dark stage, parchment paper
// card with a double-rule frame, the adaptive StepRail, a step-body slot, and
// the Cancel/Back/Continue footer that flips to Confirm on the last step.

import Spinner from "@/components/ui/Spinner";
import AbilityScoreStep from "@/features/level-up/AbilityScoreStep";
import ChoiceStep from "@/features/level-up/ChoiceStep";
import HitPointsStep from "@/features/level-up/HitPointsStep";
import LevelUpStepPlaceholder from "@/features/level-up/LevelUpStepPlaceholder";
import NewSpellsStep from "@/features/level-up/NewSpellsStep";
import ReviewStep from "@/features/level-up/ReviewStep";
import StepRail from "@/features/level-up/StepRail";
import SubclassStep from "@/features/level-up/SubclassStep";
import { useLevelUpCeremony, type LevelUpCeremony as Ceremony } from "@/features/level-up/useLevelUpCeremony";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { Character, LevelUpStep, LevelUpStepKind } from "@/types/character";

// The stage vignette is ALWAYS dark (mockup's fixed hexes, not parchment tokens):
// riding the tokens flipped it to light-cream in dark theme under a dark nav.
// The gold-400 step kicker keeps ≥6:1 contrast on it in both themes.
const STAGE =
  "min-h-screen bg-[radial-gradient(ellipse_70%_55%_at_50%_12%,#4a4230,#1c1913_68%)] px-4 py-8 sm:px-6 sm:py-12";

// The mockup's paper card: outer rule + a second rule inset 8px (the ::after).
const PAPER =
  "relative rounded border border-parchment-300 bg-parchment-50 shadow-raised after:pointer-events-none after:absolute after:inset-2 after:rounded-sm after:border after:border-parchment-300 after:content-['']";

const GHOST_BTN =
  "min-h-11 rounded-control border border-parchment-300 px-4 text-sm font-semibold text-parchment-600 transition-colors hover:bg-parchment-100";

const PRIMARY_BTN =
  "min-h-11 rounded-control border px-5 text-sm font-semibold text-parchment-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40";

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
    <div className={`${PAPER} px-6 py-10 text-center`}>
      <h1 className="font-display text-2xl font-semibold text-parchment-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-parchment-600">{body}</p>
      <button type="button" onClick={onBack} className={`${GHOST_BTN} mt-6`}>
        Back to sheet
      </button>
    </div>
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

function CeremonyFooter(c: Ceremony) {
  return (
    <footer className="mt-6 flex items-center justify-between gap-3 border-t border-parchment-200 pt-4">
      {c.stepIndex === 0 ? (
        <button type="button" onClick={c.cancel} className={GHOST_BTN}>
          Cancel
        </button>
      ) : (
        <button type="button" onClick={c.back} className={GHOST_BTN}>
          ‹ Back
        </button>
      )}
      {c.isLast ? (
        <button
          type="button"
          onClick={() => void c.confirm()}
          disabled={c.submitting}
          className={`${PRIMARY_BTN} border-vitality-700 bg-vitality-700 hover:bg-vitality-800`}
        >
          ✓ Confirm Level Up
        </button>
      ) : (
        <button
          type="button"
          onClick={c.next}
          disabled={!c.canContinue}
          className={`${PRIMARY_BTN} border-garnet-800 bg-garnet-700 hover:bg-garnet-800`}
        >
          Continue ›
        </button>
      )}
    </footer>
  );
}

export default function LevelUpCeremony({ character }: { character: Character }) {
  const c = useLevelUpCeremony(character);
  const showSpinner = useDelayedFlag(c.plan === null && !c.planError);

  let content: React.ReactNode;
  if (c.planError) {
    content = <PaperNotice title="The ceremony can't begin" body={c.planError} onBack={c.cancel} />;
  } else if (!c.plan || !c.currentStep) {
    content = showSpinner ? <Spinner variant="page" /> : null;
  } else if (c.blocked) {
    content = (
      <PaperNotice
        title="Not supported here yet"
        body="This level grants subclass feature picks (maneuvers, disciplines, or similar) that can't be resolved for a non-primary class yet — use the classic Level Up on the sheet."
        onBack={c.cancel}
      />
    );
  } else {
    content = (
      <>
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-gold-400">
          Step {c.stepIndex + 1} of {c.steps.length}
        </p>
        <section className={`${PAPER} px-5 py-7 sm:px-10`}>
          <CeremonyHeader target={c.plan.target} />
          <div className="mt-5">
            <StepRail steps={c.steps} currentKey={c.currentKey} />
          </div>
          <div className="mt-5 border-t border-parchment-200 pt-4">
            <LevelUpStepContext.Provider value={{ character, draft: c.draft, setDraft: c.setDraft, plan: c.plan }}>
              <StepBody step={c.currentStep} />
            </LevelUpStepContext.Provider>
          </div>
          {c.submitError && (
            <p role="alert" className="mt-2 text-center text-sm font-semibold text-garnet-700">
              {c.submitError}
            </p>
          )}
          <CeremonyFooter {...c} />
        </section>
      </>
    );
  }

  return (
    <div className={STAGE}>
      <div className="mx-auto w-full max-w-3xl">{content}</div>
    </div>
  );
}
