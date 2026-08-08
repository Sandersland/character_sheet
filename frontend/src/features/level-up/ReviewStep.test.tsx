import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFeats, fetchManeuvers, fetchSpells } from "@/api/client";
import ReviewStep from "@/features/level-up/ReviewStep";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import { axe } from "@/test/axe";
import type { Character, LevelUpPlanResponse, LevelUpTarget } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchManeuvers: vi.fn(),
  fetchSpells: vi.fn(),
  fetchFeats: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchManeuvers).mockResolvedValue([
    { id: "m1", name: "Riposte", description: "" },
    { id: "m2", name: "Trip Attack", description: "" },
  ]);
  vi.mocked(fetchSpells).mockResolvedValue([{ id: "s1", name: "Fireball" }] as unknown as Awaited<
    ReturnType<typeof fetchSpells>
  >);
  vi.mocked(fetchFeats).mockResolvedValue([]);
});

const character = {
  level: 7,
  rulesEdition: "EDITION_2014",
  hitPoints: { max: 52 },
  hitDice: { total: 7, die: "d10" },
  abilityScores: { strength: 16, dexterity: 14, constitution: 15, intelligence: 10, wisdom: 12, charisma: 8 },
} as unknown as Character;

// The HP row's numbers ride on the plan's own hitPoints step (#1380): the
// ADVANCING class's d10 at Con 15 (+2), which is what the backend planner
// resolves and serves. #1497: effectiveMaxAverage is ALSO served and depends
// on the character's own pre-level max, so it's built per-test via
// hpMetaFor(rawMax) rather than one shared constant (mirrors
// levelUpLedger.test.ts's own hpMetaFor).
function hpMetaFor(rawMax: number) {
  return { die: "d10", faces: 10, conMod: 2, fixedAverage: 6, averageGain: 8, minRoll: 3, maxRoll: 12, effectiveMaxAverage: rawMax + 8, effectiveMaxByRoll: [] };
}
const HP_META = hpMetaFor(52);

const plan: LevelUpPlanResponse = {
  target: { className: "Fighter", subclass: "Champion", newLevel: 8, isPrimary: true },
  steps: [{ kind: "hitPoints", meta: HP_META }],
  grantedSpells: [],
};

function renderReview(
  draft: LevelUpDraft,
  over?: { character?: Character; plan?: LevelUpPlanResponse; target?: LevelUpTarget },
) {
  return render(
    <LevelUpStepContext.Provider
      value={{
        character: over?.character ?? character,
        draft,
        setDraft: () => {},
        plan: over?.plan ?? plan,
        target: over?.target ?? { kind: "existing", classEntryId: "entry-1" },
      }}
    >
      <ReviewStep />
    </LevelUpStepContext.Provider>,
  );
}

describe("ReviewStep", () => {
  it("uses the advancing class's hit die, not the persisted primary die, for a multiclass HP row (Wizard 5 -> first Fighter level, #1441)", () => {
    const wizard = {
      ...character,
      hitPoints: { max: 30 },
      hitDice: { total: 5, die: "d6" },
    } as unknown as Character;
    const wizardPlan: LevelUpPlanResponse = { ...plan, steps: [{ kind: "hitPoints", meta: hpMetaFor(30) }] };
    renderReview({ hp: { method: "average" } }, { character: wizard, plan: wizardPlan });
    // Con 15 → +2; d10 average (Fighter, the advancing class) = 8; max 30 → 38.
    // No first-paint flash of the stale d6 answer any more: the die arrives with
    // the plan rather than resolving asynchronously from the reference catalog.
    expect(screen.getByText("38")).toBeInTheDocument();
  });

  it("shows the level and HP before → after", () => {
    renderReview({ hp: { method: "average" } });
    expect(screen.getByText("Level")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    // Con 15 (+2), d10 average = 8; max 52 → 60.
    expect(screen.getByText("52")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
  });

  it("labels an ASI ability by its display name", () => {
    renderReview({
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });
    expect(screen.getByText("Strength")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("reads the subclass name from the plan target", () => {
    renderReview({ hp: { method: "average" }, subclassId: "sc-champion" });
    expect(screen.getByText("Subclass")).toBeInTheDocument();
    expect(screen.getByText("Champion")).toBeInTheDocument();
  });

  it("resolves catalog maneuver and spell names", async () => {
    renderReview({
      hp: { method: "average" },
      maneuvers: [{ type: "learnManeuver", maneuverId: "m1" }],
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
    });
    expect(await screen.findByText("Riposte")).toBeInTheDocument();
    expect(await screen.findByText("Fireball")).toBeInTheDocument();
  });

  it("falls back to a custom pick's name", async () => {
    renderReview({
      hp: { method: "average" },
      maneuvers: [{ type: "learnManeuver", custom: { name: "Homebrew Strike", description: "" } }],
    });
    expect(await screen.findByText("Homebrew Strike")).toBeInTheDocument();
  });

  it("lists tool proficiencies by name and resolves the fighting-style feat name", async () => {
    vi.mocked(fetchFeats).mockResolvedValue([
      { id: "archery", name: "Archery", description: "" },
    ] as unknown as Awaited<ReturnType<typeof fetchFeats>>);
    renderReview({
      hp: { method: "average" },
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
      fightingStyleFeat: { type: "takeFeat", featId: "archery", slot: "fightingStyle" },
    });
    expect(screen.getByText("Smith's Tools")).toBeInTheDocument();
    expect(await screen.findByText("Archery")).toBeInTheDocument();
  });

  // Two assertions, two jobs, neither redundant (#1411). `toHaveBeenCalledWith`
  // is the red-first proof that the edition is threaded at all;
  // `toHaveBeenCalledTimes(1)` after an explicit rerender is the standing guard
  // that the fetcher keeps a stable identity — an inline arrow would re-fire
  // useCatalogNames's [fetcher] effect forever, and it would still pass a
  // calledWith-only test.
  it("fetches the feat catalog once across a re-render, for the character's edition", async () => {
    vi.mocked(fetchFeats).mockResolvedValue([
      { id: "archery", name: "Archery", description: "" },
    ] as unknown as Awaited<ReturnType<typeof fetchFeats>>);
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: "archery", slot: "fightingStyle" },
    };
    const { rerender } = renderReview(draft);
    expect(await screen.findByText("Archery")).toBeInTheDocument();

    rerender(
      <LevelUpStepContext.Provider
        value={{ character, draft, setDraft: () => {}, plan, target: { kind: "existing", classEntryId: "entry-1" } }}
      >
        <ReviewStep />
      </LevelUpStepContext.Provider>,
    );

    expect(fetchFeats).toHaveBeenCalledTimes(1);
    expect(fetchFeats).toHaveBeenCalledWith("EDITION_2014");
  });

  // The maneuver twin of the feat case above (#1412), and needed for the same
  // two reasons: fetchManeuvers now takes an argument, so its fetcher can no
  // longer be a bare module ref and is one inline arrow away from an infinite
  // refetch. Without it the Review ledger silently degrades to raw ids — a 400
  // that useCatalogNames swallows into {}.
  it("fetches the maneuver catalog once across a re-render, for the character's edition", async () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      maneuvers: [{ type: "learnManeuver", maneuverId: "m1" }],
    };
    const { rerender } = renderReview(draft);
    expect(await screen.findByText("Riposte")).toBeInTheDocument();

    rerender(
      <LevelUpStepContext.Provider
        value={{ character, draft, setDraft: () => {}, plan, target: { kind: "existing", classEntryId: "entry-1" } }}
      >
        <ReviewStep />
      </LevelUpStepContext.Provider>,
    );

    expect(fetchManeuvers).toHaveBeenCalledTimes(1);
    expect(fetchManeuvers).toHaveBeenCalledWith("EDITION_2014");
  });

  it("resolves cantrip names via the spell catalog (#1157)", async () => {
    renderReview({
      hp: { method: "average" },
      cantripsLearned: [{ type: "learnSpell", spellId: "s1" }],
    });
    expect(await screen.findByText("New Cantrips")).toBeInTheDocument();
    expect(await screen.findByText("Fireball")).toBeInTheDocument();
    expect(fetchSpells).toHaveBeenCalled();
  });

  it("shares a single spell-catalog fetch across cantrips and spells (#1157)", async () => {
    renderReview({
      hp: { method: "average" },
      cantripsLearned: [{ type: "learnSpell", spellId: "s1" }],
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
    });
    expect(await screen.findByText("New Cantrips")).toBeInTheDocument();
    expect(await screen.findByText("New Spells")).toBeInTheDocument();
    expect(fetchSpells).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing for a plain HP + ASI draft", () => {
    renderReview({
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });
    expect(fetchManeuvers).not.toHaveBeenCalled();
    expect(fetchSpells).not.toHaveBeenCalled();
    expect(fetchFeats).not.toHaveBeenCalled();
  });

  it("renders no list rows for a bare HP draft", () => {
    renderReview({ hp: { method: "average" } });
    expect(screen.queryByText("Maneuvers")).not.toBeInTheDocument();
    expect(screen.queryByText("Subclass")).not.toBeInTheDocument();
    expect(screen.queryByText("New Spells")).not.toBeInTheDocument();
  });

  it("renders a Forgotten row for a swapped spell, resolved from the spellbook (#1101)", () => {
    const swapCaster = {
      ...character,
      spellcasting: { slots: [], arcana: [], spells: [{ id: "k-old", name: "Charm Person", level: 1 }] },
    } as unknown as Character;
    renderReview(
      {
        hp: { method: "average" },
        spellsForgotten: [{ type: "forgetSpell", entryId: "k-old" }],
        spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      },
      { character: swapCaster },
    );
    expect(screen.getByText("Forgotten")).toBeInTheDocument();
    expect(screen.getByText("Charm Person")).toBeInTheDocument();
  });

  it("renders granted spells as a school-tinted unlock card, each on its own line with level + school (#1139, #1159)", () => {
    renderReview(
      { hp: { method: "average" } },
      {
        plan: {
          ...plan,
          grantedSpells: [
            { name: "Lesser Restoration", level: 2, school: "abjuration" },
            { name: "Zone of Truth", level: 2, school: "enchantment" },
          ],
        },
      },
    );
    expect(screen.getByText("Granted by Champion")).toBeInTheDocument();
    const restoration = screen.getByText("Lesser Restoration");
    const truth = screen.getByText("Zone of Truth");
    expect(restoration).toBeInTheDocument();
    expect(truth).toBeInTheDocument();
    // Distinct rows, not a run-together name string.
    expect(restoration.closest("li")).not.toBe(truth.closest("li"));
    expect(screen.getByText("Level 2 · Abjuration")).toBeInTheDocument();
    expect(screen.getByText("Level 2 · Enchantment")).toBeInTheDocument();
    // School-ink class present on the spell names (school-tinted, not run-together plain text).
    expect(restoration.className).toContain("text-school-abjuration");
    expect(truth.className).toContain("text-school-enchantment");
    // #1509 D5: no served casterModel on this fixture's plan.target → the
    // "prepared" default (SRD 5.2 Always-Prepared Spells; also the 2014
    // prepared-model classes' analogue).
    expect(screen.getByText("Always prepared — doesn't count against your spells known.")).toBeInTheDocument();
  });

  it("renders the 2014 known-caster footnote when the plan serves casterModel: known (#1509)", () => {
    renderReview(
      { hp: { method: "average" } },
      {
        plan: {
          ...plan,
          target: { ...plan.target, casterModel: "known" },
          grantedSpells: [{ name: "Find Familiar", level: 1, school: "conjuration" }],
        },
      },
    );
    expect(screen.getByText("Doesn't count against your number of spells known.")).toBeInTheDocument();
    expect(screen.queryByText(/Always prepared/i)).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderReview({
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
