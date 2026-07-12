import { useState, type ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CompactConditionsBar from "@/features/conditions/CompactConditionsBar";
import { axe } from "@/test/axe";
import * as client from "@/api/client";
import type { Character, ConditionsState } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyConditionTransactions: vi.fn(),
}));

function makeCharacter(conditions: ConditionsState): Character {
  return { id: "char-1", conditions } as unknown as Character;
}

// Stateful host so onUpdate swaps the character and the strip re-renders,
// exercising the "reflects immediately" requirement.
function Host({ initial }: { initial: ConditionsState }): ReactElement {
  const [character, setCharacter] = useState(makeCharacter(initial));
  return <CompactConditionsBar character={character} onUpdate={setCharacter} />;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CompactConditionsBar strip", () => {
  it("shows a muted 'No conditions' when clear", () => {
    render(<CompactConditionsBar character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />);
    expect(screen.getByText(/no conditions/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders active condition chips and an exhaustion chip (never raw keys)", () => {
    render(
      <CompactConditionsBar
        character={makeCharacter({
          active: [{ key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" }],
          exhaustion: 2,
        })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.queryByText("poisoned")).not.toBeInTheDocument();
    expect(screen.getByText("Exhaustion 2")).toBeInTheDocument();
  });

  it("omits the exhaustion chip at level 0", () => {
    render(
      <CompactConditionsBar
        character={makeCharacter({
          active: [{ key: "prone", appliedAt: "2026-01-01T00:00:00.000Z" }],
          exhaustion: 0,
        })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("Prone")).toBeInTheDocument();
    expect(screen.queryByText(/exhaustion/i)).not.toBeInTheDocument();
  });

  it("exposes the strip as a button named 'Manage conditions'", () => {
    render(<CompactConditionsBar character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /manage conditions/i })).toBeInTheDocument();
  });
});

describe("CompactConditionsBar tap-to-manage sheet (#769)", () => {
  it("tapping the strip opens the 'Conditions' sheet with the full controls", async () => {
    const user = userEvent.setup();
    render(<CompactConditionsBar character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /manage conditions/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /conditions/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /add condition/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /increase exhaustion/i })).toBeInTheDocument();
  });

  it("applying a condition from the sheet fires applyCondition and reflects on the strip", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyConditionTransactions).mockResolvedValue(
      makeCharacter({ active: [{ key: "prone", appliedAt: "2026-01-01T00:00:00.000Z" }], exhaustion: 0 }),
    );

    render(<Host initial={{ active: [], exhaustion: 0 }} />);

    await user.click(screen.getByRole("button", { name: /manage conditions/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /add condition/i }));
    const proneRow = within(dialog).getByText("Prone").closest("li")!;
    await user.click(within(proneRow).getByRole("button", { name: "Apply" }));

    expect(client.applyConditionTransactions).toHaveBeenCalledWith("char-1", [
      { type: "applyCondition", key: "prone" },
    ]);
    // Strip itself now shows the applied chip.
    const strip = await screen.findByRole("button", { name: /manage conditions/i });
    expect(await within(strip).findByText("Prone")).toBeInTheDocument();
  });

  it("removing a condition from the sheet fires removeCondition and clears the chip", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyConditionTransactions).mockResolvedValue(
      makeCharacter({ active: [], exhaustion: 0 }),
    );

    render(
      <Host initial={{ active: [{ key: "stunned", appliedAt: "2026-01-01T00:00:00.000Z" }], exhaustion: 0 }} />,
    );

    await user.click(screen.getByRole("button", { name: /manage conditions/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /remove stunned/i }));

    expect(client.applyConditionTransactions).toHaveBeenCalledWith("char-1", [
      { type: "removeCondition", key: "stunned" },
    ]);
  });

  it("has no axe violations with the sheet open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CompactConditionsBar character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /manage conditions/i }));
    await screen.findByRole("dialog");
    expect(await axe(container)).toHaveNoViolations();
  });
});
