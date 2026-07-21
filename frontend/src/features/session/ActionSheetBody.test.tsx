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
    interactionBudgetRemaining: 1, // fresh turn: the free interaction unspent
    ...over,
  };
}

function renderBody(m: ActionSheetModel, actionAvailable = true) {
  return render(
    <ActionSheetBody
      model={m}
      busy={false}
      actionAvailable={actionAvailable}
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

describe("ActionSheetBody — free-only mode after the Action is spent (#1165)", () => {
  it("disables Attack, Use an item, Dash and Dodge with the no-action reason", () => {
    renderBody(model({ interactionBudgetRemaining: 0 }), false);
    expect(screen.getByRole("button", { name: "Attack" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use an item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dash" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dodge" })).toBeDisabled();
  });

  it("keeps Change weapons enabled while the interaction budget still has a free unit", () => {
    renderBody(model({ interactionBudgetRemaining: 1 }), false);
    expect(screen.getByRole("button", { name: "Change weapons" })).toBeEnabled();
  });

  it("disables Change weapons only once both the budget and the Action are gone", () => {
    renderBody(model({ interactionBudgetRemaining: 0 }), false);
    expect(screen.getByRole("button", { name: "Change weapons" })).toBeDisabled();
  });

  it("re-enables every card once the Action is available again", () => {
    renderBody(model({ interactionBudgetRemaining: 0 }), true);
    expect(screen.getByRole("button", { name: "Attack" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Change weapons" })).toBeEnabled();
  });
});
