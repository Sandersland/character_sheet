import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdvancementPanel from "@/features/advancement/AdvancementPanel";
import { ABILITY_OPTIONS } from "@/lib/abilities";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  fetchFeats: vi.fn().mockResolvedValue([]),
}));

const noop = () => {};

const SCORES: Record<string, number> = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

describe("AdvancementPanel accessibility", () => {
  it("names every ASI stepper button (no axe violations)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AdvancementPanel
        currentScores={SCORES}
        slotsRemaining={2}
        busy={false}
        skillNames={[]}
        onSubmit={noop}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "+ Choose advancement" })
    );

    for (const { label } of ABILITY_OPTIONS) {
      expect(
        screen.getByRole("button", { name: `Increase ${label}` })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Decrease ${label}` })
      ).toBeInTheDocument();
    }

    expect(await axe(container)).toHaveNoViolations();
  });
});
