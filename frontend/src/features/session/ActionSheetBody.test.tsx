import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ActionSheetBody from "@/features/session/ActionSheetBody";
import type { ActionSheetModel } from "@/lib/turnOptions";

function model(over: Partial<ActionSheetModel> = {}): ActionSheetModel {
  return {
    attackSummary: "Unarmed Strike · +2 to hit · 1 bludgeoning",
    consumableCount: 0,
    hasSpellcasting: false,
    classActionOptions: [],
    loadoutLabel: "Unarmed",
    hasEquippableItems: true,
    ...over,
  };
}

function renderBody(m: ActionSheetModel) {
  return render(
    <ActionSheetBody
      model={m}
      busy={false}
      handleAttackAction={vi.fn()}
      handleActionClick={vi.fn()}
    />,
  );
}

describe("ActionSheetBody (#815)", () => {
  it("offers Change weapons when there is anything to hold or stow", () => {
    renderBody(model());
    expect(screen.getByText("Change weapons")).toBeInTheDocument();
  });

  it("hides Change weapons with empty hands and an empty bag", () => {
    renderBody(model({ hasEquippableItems: false }));
    expect(screen.queryByText("Change weapons")).toBeNull();
  });
});
