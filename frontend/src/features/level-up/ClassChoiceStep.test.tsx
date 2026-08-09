import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClassChoiceStep from "@/features/level-up/ClassChoiceStep";
import type { ClassChoiceOption } from "@/lib/levelUpClassChoice";

const OPTIONS: ClassChoiceOption[] = [
  { target: { kind: "existing", classEntryId: "entry-1" }, name: "Fighter", levelLine: "Level 5 → 6", eligible: true },
  { target: { kind: "new", classId: "cls-rogue" }, name: "Rogue", levelLine: "New class — Level 1", eligible: true },
  {
    target: { kind: "new", classId: "cls-wizard" },
    name: "Wizard",
    levelLine: "New class — Level 1",
    eligible: false,
    requirement: "Intelligence 13",
  },
];

const EXISTING_ONLY_OPTIONS: ClassChoiceOption[] = [
  { target: { kind: "existing", classEntryId: "entry-1" }, name: "Fighter", levelLine: "Level 5 → 6", eligible: true },
];

// A disabled option sandwiched between two enabled ones, so skip-over and
// wrap are distinguishable in the arrow-navigation tests (#1324).
const KEYBOARD_OPTIONS: ClassChoiceOption[] = [
  { target: { kind: "existing", classEntryId: "entry-1" }, name: "Fighter", levelLine: "Level 5 → 6", eligible: true },
  { target: { kind: "new", classId: "cls-rogue" }, name: "Rogue", levelLine: "New class — Level 1", eligible: true },
  {
    target: { kind: "new", classId: "cls-wizard" },
    name: "Wizard",
    levelLine: "New class — Level 1",
    eligible: false,
    requirement: "Intelligence 13",
  },
  { target: { kind: "new", classId: "cls-cleric" }, name: "Cleric", levelLine: "New class — Level 1", eligible: true },
];

describe("ClassChoiceStep", () => {
  it("top view shows existing-class radios and a New class drill-in button, but no new-class radios", () => {
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole("radio", { name: "Fighter" })).toBeEnabled();
    expect(screen.queryByRole("radio", { name: "Rogue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Wizard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new class/i })).toBeInTheDocument();
  });

  it("does not render a New class button when there are no new-class options", () => {
    render(
      <ClassChoiceStep
        options={EXISTING_ONLY_OPTIONS}
        initialTarget={null}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /new class/i })).not.toBeInTheDocument();
  });

  it("opening the New class drill-in reveals the new-class options and a back control", async () => {
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /new class/i }));

    expect(screen.getByRole("radio", { name: "Rogue" })).toBeEnabled();
    const wizard = screen.getByRole("radio", { name: "Wizard" });
    expect(wizard).toBeDisabled();
    expect(screen.getByText(/requires intelligence 13/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to class selection/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Fighter" })).not.toBeInTheDocument();
  });

  it("the back control returns from the drill-in to the top view", async () => {
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /new class/i }));
    expect(screen.getByRole("radio", { name: "Rogue" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to class selection/i }));

    expect(screen.getByRole("radio", { name: "Fighter" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Rogue" })).not.toBeInTheDocument();
  });

  it("gates Continue off after a drill-in pick is left behind by going back (#1209 review)", async () => {
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /new class/i }));
    await user.click(screen.getByRole("radio", { name: "Rogue" }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();

    // Back in the top view the Rogue pick isn't on screen, so Continue can't
    // silently submit it — the enabled state must track the visible selection.
    await user.click(screen.getByRole("button", { name: /back to class selection/i }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("keeps a top-level pick live across an incidental drill-in visit (#1209 review)", async () => {
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("radio", { name: "Fighter" }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();

    // Peeking into the drill-in gates Continue off (Fighter isn't shown there)…
    await user.click(screen.getByRole("button", { name: /new class/i }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    // …and returning restores the Fighter selection rather than dropping it.
    await user.click(screen.getByRole("button", { name: /back to class selection/i }));
    expect(screen.getByRole("radio", { name: "Fighter" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("Continue is disabled until an option is picked, when there's no initial selection", () => {
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("a new-class deep link opens directly in the drill-in, preselected, and Continue routes to it", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <ClassChoiceStep
        options={OPTIONS}
        initialTarget={{ kind: "new", classId: "cls-rogue" }}
        onContinue={onContinue}
        onCancel={vi.fn()}
      />,
    );

    const rogue = screen.getByRole("radio", { name: "Rogue" });
    expect(rogue).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radio", { name: "Fighter" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith({ kind: "new", classId: "cls-rogue" });
  });

  it("picking a new-class option from the drill-in updates the selection and routes Continue to it", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <ClassChoiceStep
        options={OPTIONS}
        initialTarget={{ kind: "existing", classEntryId: "entry-1" }}
        onContinue={onContinue}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new class/i }));
    await user.click(screen.getByRole("radio", { name: "Rogue" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith({ kind: "new", classId: "cls-rogue" });
  });

  it("clicking the disabled ineligible option does not select it", async () => {
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /new class/i }));
    await user.click(screen.getByRole("radio", { name: "Wizard" }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  describe("roving-radiogroup keyboard behavior (#1324)", () => {
    it("only one card is in the Tab order (roving tabindex)", () => {
      render(
        <ClassChoiceStep
          options={EXISTING_ONLY_OPTIONS}
          initialTarget={{ kind: "existing", classEntryId: "entry-1" }}
          onContinue={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole("radio", { name: "Fighter" })).toHaveAttribute("tabindex", "0");
    });

    it("falls back to the first enabled card's tabindex when nothing is selected", async () => {
      const user = userEvent.setup();
      render(
        <ClassChoiceStep options={OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
      );
      await user.click(screen.getByRole("button", { name: /new class/i }));
      // Rogue (eligible) is first in the drill-in; Wizard (ineligible) is second.
      expect(screen.getByRole("radio", { name: "Rogue" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("radio", { name: "Wizard" })).toHaveAttribute("tabindex", "-1");
    });

    it("ArrowDown skips a disabled card in between and lands on the next enabled one", async () => {
      const user = userEvent.setup();
      render(
        <ClassChoiceStep options={KEYBOARD_OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
      );
      await user.click(screen.getByRole("button", { name: /new class/i }));
      // Drill-in order: Rogue (enabled), Wizard (disabled), Cleric (enabled).
      screen.getByRole("radio", { name: "Rogue" }).focus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("radio", { name: "Cleric" })).toHaveFocus();
    });

    it("ArrowUp from the last card skips the disabled middle card going backward", async () => {
      const user = userEvent.setup();
      render(
        <ClassChoiceStep options={KEYBOARD_OPTIONS} initialTarget={null} onContinue={vi.fn()} onCancel={vi.fn()} />,
      );
      await user.click(screen.getByRole("button", { name: /new class/i }));
      screen.getByRole("radio", { name: "Cleric" }).focus();
      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("radio", { name: "Rogue" })).toHaveFocus();
    });

    it("arrow navigation moves selection, not just focus", async () => {
      const user = userEvent.setup();
      const onContinue = vi.fn();
      render(
        <ClassChoiceStep options={KEYBOARD_OPTIONS} initialTarget={null} onContinue={onContinue} onCancel={vi.fn()} />,
      );
      await user.click(screen.getByRole("button", { name: /new class/i }));
      screen.getByRole("radio", { name: "Rogue" }).focus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("radio", { name: "Cleric" })).toHaveAttribute("aria-checked", "true");
      await user.click(screen.getByRole("button", { name: /continue/i }));
      expect(onContinue).toHaveBeenCalledWith({ kind: "new", classId: "cls-cleric" });
    });
  });
});
