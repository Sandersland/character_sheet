import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys, referenceKeys } from "@/api/queryKeys";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import * as client from "@/api/client";
import type { Character, ConditionOption, ConditionsState } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// Mock the API client — ConditionsStrip batches condition ops and swaps the
// returned Character straight into the character query cache. fetchReference
// must be present even though these tests seed the reference cache directly
// (never call it) — ConditionsSheetBody's useReferenceData imports it from
// this same barrel, and an omitted export here is `undefined`, which the
// skipped-then-enabled query would call the moment a real edition arrives.
vi.mock("@/api/client", () => ({
  applyConditionTransactions: vi.fn(),
  fetchReference: vi.fn(),
}));

function makeCharacter(conditions: ConditionsState, over?: Partial<Character>): Character {
  return {
    id: "char-1",
    rulesEdition: "EDITION_2024",
    exhaustionEffectText: "No exhaustion.",
    conditions,
    ...over,
  } as unknown as Character;
}

function seedReference(edition: RulesEdition, conditions: ConditionOption[]) {
  getQueryClient().setQueryData(referenceKeys.byEdition(edition), {
    races: [],
    classes: [],
    backgrounds: [],
    alignments: [],
    artisanTools: [],
    conditions,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ConditionsStrip's nested ConditionsSheetBody reads useCurrentCharacter(), so
// every render seeds the cache and mounts CurrentCharacterProvider. "rerender"
// writes the new character straight into the cache — the same mechanism a
// mutation's onSuccess uses in production — since the component no longer has
// a prop to receive a fresh value through.
function render(character: Character) {
  const result = renderWithCharacter(<ConditionsStrip />, character);
  return {
    ...result,
    rerender: (next: Character) => {
      getQueryClient().setQueryData(characterKeys.detail(character.id), next);
      result.rerender(<ConditionsStrip />);
    },
  };
}

describe("ConditionsStrip", () => {
  it("shows an empty state with no active conditions", () => {
    render(makeCharacter({ active: [], exhaustion: 0 }));
    expect(screen.getByText(/no active conditions/i)).toBeInTheDocument();
  });

  it("renders active condition labels (never raw keys) and exhaustion level", () => {
    render(
      makeCharacter({
        active: [{ key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" }],
        exhaustion: 2,
      }),
    );
    // Label, not the raw key.
    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.queryByText("poisoned")).not.toBeInTheDocument();
    // Exhaustion value rendered.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("fires an applyCondition op from the inline add panel", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(makeCharacter({ active: [], exhaustion: 0 }));

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    // Picker is open; apply Prone.
    const proneRow = screen.getByText("Prone").closest("li")!;
    await user.click(within(proneRow).getByRole("button", { name: "Apply" }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      { type: "applyCondition", key: "prone" },
    ]);
  });

  it("includes a typed source in the applyCondition op", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(makeCharacter({ active: [], exhaustion: 0 }));

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    await user.type(screen.getByPlaceholderText("Giant Spider"), "  Giant Spider  ");
    const proneRow = screen.getByText("Prone").closest("li")!;
    await user.click(within(proneRow).getByRole("button", { name: "Apply" }));

    // Source is trimmed and passed through.
    expect(mockApply).toHaveBeenCalledWith("char-1", [
      { type: "applyCondition", key: "prone", source: "Giant Spider" },
    ]);
  });

  it("omits source from the op when the field is blank or whitespace", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(makeCharacter({ active: [], exhaustion: 0 }));

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    await user.type(screen.getByPlaceholderText("Giant Spider"), "   ");
    const proneRow = screen.getByText("Prone").closest("li")!;
    await user.click(within(proneRow).getByRole("button", { name: "Apply" }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      { type: "applyCondition", key: "prone" },
    ]);
  });

  it("fires a removeCondition op when the chip remove control is clicked", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(
      makeCharacter({
        active: [{ key: "stunned", appliedAt: "2026-01-01T00:00:00.000Z" }],
        exhaustion: 0,
      }),
    );

    await user.click(screen.getByRole("button", { name: /remove stunned/i }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [
      { type: "removeCondition", key: "stunned" },
    ]);
  });

  it("steps exhaustion up via setExhaustion", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 3 }));

    render(makeCharacter({ active: [], exhaustion: 2 }));

    await user.click(screen.getByRole("button", { name: /increase exhaustion/i }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setExhaustion", level: 3 }]);
  });

  it("disables the exhaustion decrement at level 0 and increment at level 6", () => {
    const { rerender } = render(makeCharacter({ active: [], exhaustion: 0 }));
    expect(screen.getByRole("button", { name: /decrease exhaustion/i })).toBeDisabled();

    rerender(makeCharacter({ active: [], exhaustion: 6 }));
    expect(screen.getByRole("button", { name: /increase exhaustion/i })).toBeDisabled();
  });

  // #1322: a 2014-stamped character used to render exhaustionEffect(3)'s 2024
  // text (a flat "−6 on d20 Tests…") regardless of edition — contradicting the
  // Speed value and roll chips rendered right beside it. The sentence now
  // comes off the wire (exhaustionEffectText), authored server-side beside the
  // same numbers that drive Speed and rollModifiers.
  it("a 2014 character at exhaustion 3 sees 2014 text, not 2024's", () => {
    render(
      makeCharacter(
        { active: [], exhaustion: 3 },
        {
          rulesEdition: "EDITION_2014",
          exhaustionEffectText:
            "Disadvantage on attack rolls, ability checks, saving throws, and initiative; Speed halved.",
        },
      ),
    );
    expect(
      screen.getByText(
        "Disadvantage on attack rolls, ability checks, saving throws, and initiative; Speed halved.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/−6 on d20 Tests/)).not.toBeInTheDocument();
  });

  it("a 2024 character at exhaustion 3 is unchanged — the flat d20-Tests/Speed sentence", () => {
    render(
      makeCharacter(
        { active: [], exhaustion: 3 },
        { rulesEdition: "EDITION_2024", exhaustionEffectText: "−6 on d20 Tests; Speed −15 ft." },
      ),
    );
    expect(screen.getByText("−6 on d20 Tests; Speed −15 ft.")).toBeInTheDocument();
  });

  it("the picker lists a 2014 character's condition text (Grappled), not 2024's", async () => {
    const user = userEvent.setup();
    seedReference("EDITION_2014", [
      {
        key: "grappled",
        label: "Grappled",
        description:
          "Speed becomes 0, and it can't benefit from any bonus to its speed. The condition ends if the grappler is incapacitated or if the creature is moved out of reach.",
      },
    ]);
    render(makeCharacter({ active: [], exhaustion: 0 }, { rulesEdition: "EDITION_2014" }));

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    expect(
      screen.getByText(/The condition ends if the grappler is incapacitated/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/other than the grappler/)).not.toBeInTheDocument();
  });

  it("the picker lists a 2024 character's condition text (Grappled), not 2014's", async () => {
    const user = userEvent.setup();
    seedReference("EDITION_2024", [
      {
        key: "grappled",
        label: "Grappled",
        description:
          "Speed is 0 and can't increase. Has disadvantage on attack rolls against any target other than the grappler.",
      },
    ]);
    render(makeCharacter({ active: [], exhaustion: 0 }, { rulesEdition: "EDITION_2024" }));

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    expect(screen.getByText(/other than the grappler/)).toBeInTheDocument();
    expect(
      screen.queryByText(/The condition ends if the grappler is incapacitated/),
    ).not.toBeInTheDocument();
  });

  it("edition is cache identity: a 2024 character never renders a 2014-seeded description", async () => {
    const user = userEvent.setup();
    seedReference("EDITION_2014", [
      { key: "grappled", label: "Grappled", description: "2014-only text that must never leak." },
    ]);
    render(makeCharacter({ active: [], exhaustion: 0 }, { rulesEdition: "EDITION_2024" }));

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    expect(screen.queryByText("2014-only text that must never leak.")).not.toBeInTheDocument();
    // Falls back to the edition-invariant label-only list — still lists Grappled.
    expect(screen.getByText("Grappled")).toBeInTheDocument();
  });

  it("degrades gracefully with no reference cached: all 14 conditions still list by label, no description", async () => {
    const user = userEvent.setup();
    render(makeCharacter({ active: [], exhaustion: 0 }));

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    const poisonedRow = screen.getByText("Poisoned").closest("li")!;
    expect(within(poisonedRow).getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByText("Grappled")).toBeInTheDocument();
  });
});
