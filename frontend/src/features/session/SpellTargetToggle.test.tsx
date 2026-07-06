import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellTargetToggle from "@/features/session/SpellTargetToggle";
import type { AllyOption } from "@/lib/spellMeta";

const ALLIES: AllyOption[] = [
  { characterId: "ally-1", name: "Grog" },
  { characterId: "ally-2", name: "Vex" },
];

describe("SpellTargetToggle", () => {
  it("reports the chosen target on click (damage → self/other)", async () => {
    const onSelect = vi.fn();
    render(
      <SpellTargetToggle target="self" locked={false} disabled={false} healing={false} allies={[]} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "other" }));
    expect(onSelect).toHaveBeenCalledWith("other");
  });

  it("disables both buttons when locked", () => {
    render(
      <SpellTargetToggle target="self" locked disabled={false} healing={false} allies={[]} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "self" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "other" })).toBeDisabled();
  });

  it("offers self + one button per opted-in ally for a healing spell", async () => {
    const onSelect = vi.fn();
    render(
      <SpellTargetToggle target="self" locked={false} disabled={false} healing allies={ALLIES} onSelect={onSelect} />,
    );
    expect(screen.getByRole("button", { name: "self" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "other" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Grog" }));
    expect(onSelect).toHaveBeenCalledWith(ALLIES[0]);
  });

  it("shows only self for a healing spell with no opted-in allies", () => {
    render(
      <SpellTargetToggle target="self" locked={false} disabled={false} healing allies={[]} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "self" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "other" })).not.toBeInTheDocument();
  });
});
