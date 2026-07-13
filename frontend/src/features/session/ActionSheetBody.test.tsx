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
  // Deliberate (PR #824 review finding 2, declined): the card stays visible even
  // unarmed with an empty bag — cards are stable, the picker owns its empty state
  // (same convention as "Use an item" at zero consumables). The session e2e
  // exercises exactly this persona.
  it("offers Change weapons even when unarmed with an empty bag", () => {
    renderBody(model());
    expect(screen.getByText("Change weapons")).toBeInTheDocument();
  });

  it("hides Cast a spell for non-casters", () => {
    renderBody(model());
    expect(screen.queryByText("Cast a spell")).toBeNull();
    renderBody(model({ hasSpellcasting: true }));
    expect(screen.getByText("Cast a spell")).toBeInTheDocument();
  });
});
