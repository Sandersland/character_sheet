// The picker and the submitted op must both fall back to the same
// `effectiveStep` result when a selected ki amount falls out of range (#1737).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DisciplineRow from "@/features/class/DisciplineRow";
import type { CatalogDiscipline, ChoiceEntry } from "@/types/character";

const WATER_WHIP: CatalogDiscipline = {
  id: "disc-water-whip",
  name: "Water Whip",
  description: "You call forth water to lash out at your enemies.",
  minLevel: 3,
  cost: { kind: "pool", key: "ki", base: 2, perStep: 1 },
  effect: {
    effectType: "damage",
    damageType: "bludgeoning",
    attackType: "melee",
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "none" },
    concentration: false,
  },
  steps: [
    { ki: 2, roll: { count: 3, faces: 10, modifier: 0 } },
    { ki: 3, roll: { count: 4, faces: 10, modifier: 0 } },
    { ki: 4, roll: { count: 5, faces: 10, modifier: 0 } },
  ],
};

const ENTRY: ChoiceEntry = {
  id: "entry-water-whip",
  optionId: "disc-water-whip",
  name: "Water Whip",
  description: WATER_WHIP.description,
};

function renderRow(over: Partial<Parameters<typeof DisciplineRow>[0]> = {}) {
  const onCast = vi.fn();
  const utils = render(
    <ul>
      <DisciplineRow entry={ENTRY} catalog={WATER_WHIP} kiAvailable={6} busy={false} onCast={onCast} {...over} />
    </ul>,
  );
  return { onCast, ...utils };
}

describe("DisciplineRow — KiPicker stale selection (#1737)", () => {
  it("re-normalises the picker and the cast op when a selected ki amount drops out of range", async () => {
    const user = userEvent.setup();
    const onCast = vi.fn();
    const { rerender } = render(
      <ul>
        <DisciplineRow entry={ENTRY} catalog={WATER_WHIP} kiAvailable={6} busy={false} onCast={onCast} />
      </ul>,
    );

    const select = screen.getByLabelText("Ki to spend on Water Whip");
    await user.selectOptions(select, "4");
    expect(select).toHaveValue("4");

    rerender(
      <ul>
        <DisciplineRow entry={ENTRY} catalog={WATER_WHIP} kiAvailable={3} busy={false} onCast={onCast} />
      </ul>,
    );

    expect(select).toHaveValue("2");

    await user.click(screen.getByRole("button", { name: "Cast" }));
    expect(onCast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "castDiscipline", entryId: ENTRY.id, requestedKi: 2 }),
    );
  });

  it("casts the selected ki amount unchanged when it stays affordable", async () => {
    const user = userEvent.setup();
    const { onCast } = renderRow({ kiAvailable: 6 });
    const select = screen.getByLabelText("Ki to spend on Water Whip");
    await user.selectOptions(select, "3");
    await user.click(screen.getByRole("button", { name: "Cast" }));
    expect(onCast).toHaveBeenCalledWith(expect.objectContaining({ requestedKi: 3 }));
  });
});
