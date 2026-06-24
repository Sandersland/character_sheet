import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import * as client from "@/api/client";
import type { Character, ConditionsState } from "@/types/character";

// Mock the API client — ConditionsStrip batches condition ops and swaps the
// returned Character via onUpdate.
vi.mock("@/api/client", () => ({
  applyConditionTransactions: vi.fn(),
}));

function makeCharacter(conditions: ConditionsState): Character {
  return {
    id: "char-1",
    conditions,
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConditionsStrip", () => {
  it("shows an empty state with no active conditions", () => {
    render(
      <ConditionsStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );
    expect(screen.getByText(/no active conditions/i)).toBeInTheDocument();
  });

  it("renders active condition labels (never raw keys) and exhaustion level", () => {
    render(
      <ConditionsStrip
        character={makeCharacter({
          active: [{ key: "poisoned", appliedAt: "2026-01-01T00:00:00.000Z" }],
          exhaustion: 2,
        })}
        onUpdate={vi.fn()}
      />,
    );
    // Label, not the raw key.
    expect(screen.getByText("Poisoned")).toBeInTheDocument();
    expect(screen.queryByText("poisoned")).not.toBeInTheDocument();
    // Exhaustion value rendered.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("fires an applyCondition op from the inline add panel", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(
      <ConditionsStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={onUpdate} />,
    );

    await user.click(screen.getByRole("button", { name: /add condition/i }));
    // Picker is open; apply Prone.
    const proneRow = screen.getByText("Prone").closest("li")!;
    await user.click(within(proneRow).getByRole("button", { name: "Apply" }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [
      { type: "applyCondition", key: "prone" },
    ]);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("includes a typed source in the applyCondition op", async () => {
    const user = userEvent.setup();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(
      <ConditionsStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );

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

    render(
      <ConditionsStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );

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
    const onUpdate = vi.fn();
    const mockApply = vi.mocked(client.applyConditionTransactions);
    mockApply.mockResolvedValue(makeCharacter({ active: [], exhaustion: 0 }));

    render(
      <ConditionsStrip
        character={makeCharacter({
          active: [{ key: "stunned", appliedAt: "2026-01-01T00:00:00.000Z" }],
          exhaustion: 0,
        })}
        onUpdate={onUpdate}
      />,
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

    render(
      <ConditionsStrip
        character={makeCharacter({ active: [], exhaustion: 2 })}
        onUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /increase exhaustion/i }));
    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setExhaustion", level: 3 }]);
  });

  it("disables the exhaustion decrement at level 0 and increment at level 6", () => {
    const { rerender } = render(
      <ConditionsStrip character={makeCharacter({ active: [], exhaustion: 0 })} onUpdate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /decrease exhaustion/i })).toBeDisabled();

    rerender(
      <ConditionsStrip character={makeCharacter({ active: [], exhaustion: 6 })} onUpdate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /increase exhaustion/i })).toBeDisabled();
  });
});
