import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ActionSheetBody from "@/features/session/ActionSheetBody";
import type { ActionSheetModel } from "@/lib/turnOptions";
import { SERVED_ACTIONS_2014, SERVED_ACTIONS_2024 } from "@/test/universalActions";

function model(over: Partial<ActionSheetModel> = {}): ActionSheetModel {
  return {
    attackSummary: "Unarmed Strike · +2 to hit · 1 bludgeoning",
    consumableCount: 0,
    hasSpellcasting: false,
    classActionOptions: [],
    loadoutLabel: "Unarmed",
    interactionBudgetRemaining: 1,
    universalActions: SERVED_ACTIONS_2024,
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

describe("ActionSheetBody — the More-actions grid follows the served rows (#1430)", () => {
  it("2024: nine tiles, alphabetical, with Study and Influence", async () => {
    renderBody(model());
    expect(
      screen.getByText("Disengage · Grapple · Help · Hide · Influence · Ready · Search · Shove · Study"),
    ).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /More actions/ }));
    expect(screen.getByRole("button", { name: "Study" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Influence" })).toBeInTheDocument();
  });

  it("2014: seven tiles, no Study or Influence", async () => {
    renderBody(model({ universalActions: SERVED_ACTIONS_2014 }));
    expect(screen.getByText("Disengage · Grapple · Help · Hide · Ready · Search · Shove")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /More actions/ }));
    expect(screen.queryByRole("button", { name: "Study" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Influence" })).toBeNull();
    expect(screen.getByRole("button", { name: "Grapple" })).toBeInTheDocument();
  });

  it("renders no More-actions disclosure at all while the reference cache is unresolved", () => {
    renderBody(model({ universalActions: [] }));
    expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Attack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dash" })).toBeInTheDocument();
  });
});
