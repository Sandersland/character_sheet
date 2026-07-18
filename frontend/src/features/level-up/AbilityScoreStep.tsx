// The ceremony's "advancement" step (#888): pick an Ability Score Improvement or
// a feat. A segmented branch toggle swaps between the two; each branch stages its
// op into draft.advancement, which the footer Continue gate reads (draftSatisfies).

import { useEffect, useReducer, useState } from "react";

import AsiAbilityGrid from "@/features/level-up/AsiAbilityGrid";
import { FEAT_VIEW_INITIAL, featViewReducer } from "@/features/advancement/featView";
import FeatFlow from "@/features/advancement/FeatFlow";
import { useAsiDraft } from "@/features/advancement/useAsiDraft";
import { useCustomFeatDraft } from "@/features/advancement/useCustomFeatDraft";
import { useFeatCatalog } from "@/features/advancement/useFeatCatalog";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";

type Branch = "asi" | "feat";

const BRANCH_BTN =
  "flex flex-1 items-center justify-center gap-2 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors";
const BRANCH_ON = "bg-garnet-700 text-parchment-50 shadow-raised";
const BRANCH_OFF = "text-parchment-600 hover:text-parchment-800";

export default function AbilityScoreStep() {
  const { character, setDraft } = useLevelUpStepContext();
  const [branch, setBranch] = useState<Branch>("asi");

  const currentScores = (character.abilityScores ?? {}) as unknown as Record<string, number>;
  const skillNames = (character.skills ?? []).map((s) => s.name);

  const asi = useAsiDraft();

  const feats = useFeatCatalog(branch === "feat");
  const [view, dispatchView] = useReducer(featViewReducer, FEAT_VIEW_INITIAL);
  const custom = useCustomFeatDraft();

  // Reactively stage the ASI op so the footer Continue reads it — no Apply button.
  useEffect(() => {
    if (branch !== "asi") return;
    setDraft((d) => ({ ...d, advancement: asi.totalPoints === 2 ? asi.buildOperation() : undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildOperation is a render-fresh closure; asi.totalPoints/increases are the real triggers, listing it would re-run every render and loop
  }, [branch, asi.totalPoints, asi.increases, setDraft]);

  // Switching branches must drop any op the other branch staged, or a stale op
  // could satisfy Continue for the wrong choice.
  function switchBranch(next: Branch) {
    if (next === branch) return;
    setBranch(next);
    asi.reset();
    dispatchView({ type: "reset" });
    custom.reset();
    setDraft((d) => ({ ...d, advancement: undefined }));
  }

  // Mirrors AdvancementPanel.handleFeatSubmit — half-feats default to the first
  // ability option when the player left the picker on its single option.
  function stageFeat() {
    if (view.customMode) {
      const op = custom.buildOperation();
      if (!op) return;
      setDraft((d) => ({ ...d, advancement: op }));
    } else if (view.selectedFeat) {
      const opts = view.selectedFeat.abilityOptions;
      if (opts.length > 1 && !view.abilityChoice) return;
      setDraft((d) => ({
        ...d,
        advancement: {
          type: "takeFeat",
          featId: view.selectedFeat!.id,
          abilityChoice: opts.length > 0 ? view.abilityChoice || opts[0] : undefined,
        },
      }));
    }
  }

  return (
    <div>
      <h2 className="text-center font-display text-xl font-semibold text-parchment-900">
        Improve your abilities, or take a feat?
      </h2>

      <div className="mx-auto mt-4 flex max-w-md gap-2 rounded-lg border border-parchment-200 bg-parchment-100 p-1">
        <button type="button" onClick={() => switchBranch("asi")} aria-pressed={branch === "asi"} className={`${BRANCH_BTN} ${branch === "asi" ? BRANCH_ON : BRANCH_OFF}`}>
          Improve Ability Scores
        </button>
        <button type="button" onClick={() => switchBranch("feat")} aria-pressed={branch === "feat"} className={`${BRANCH_BTN} ${branch === "feat" ? BRANCH_ON : BRANCH_OFF}`}>
          Take a Feat
        </button>
      </div>

      {branch === "asi" ? (
        <AsiAbilityGrid asi={asi} currentScores={currentScores} />
      ) : (
        <div className="mt-4">
          <FeatFlow
            currentScores={currentScores}
            skillNames={skillNames}
            busy={false}
            feats={feats}
            view={view}
            dispatchView={dispatchView}
            custom={custom}
            onSubmit={stageFeat}
          />
        </div>
      )}
    </div>
  );
}
