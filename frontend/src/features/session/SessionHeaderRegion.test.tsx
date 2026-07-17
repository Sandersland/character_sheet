import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SessionHeaderRegion from "@/features/session/SessionHeaderRegion";

// #976: on the live Combat tab the sheet's own header (MobileSheetHeader / the
// desktop banner) already owns character identity + the live round, so this
// strip carries ONLY the session controls — no duplicated name and no dead
// "← Character sheet" back-link (there's no separate page to go back from).
function renderRegion(props: Partial<React.ComponentProps<typeof SessionHeaderRegion>> = {}) {
  const handlers = {
    onCapture: vi.fn(),
    onLeave: vi.fn(),
    onEndClick: vi.fn(),
  };
  render(
    <SessionHeaderRegion
      leavePending={false}
      endPending={false}
      leaveError={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("SessionHeaderRegion", () => {
  it("renders no character-identity heading and no back-to-sheet link", () => {
    renderRegion();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /character sheet/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/back to character sheet/i)).not.toBeInTheDocument();
  });

  it("exposes the desktop inline Note / Leave / End controls and fires their handlers", async () => {
    const user = userEvent.setup();
    const handlers = renderRegion();

    await user.click(screen.getByRole("button", { name: "End Session" }));
    expect(handlers.onEndClick).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Leave Session" }));
    expect(handlers.onLeave).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /Note/ }));
    expect(handlers.onCapture).toHaveBeenCalledOnce();
  });

  it("collapses the controls into a mobile overflow menu with the same items", async () => {
    const user = userEvent.setup();
    const handlers = renderRegion();
    await user.click(screen.getByRole("button", { name: "Session actions" }));

    const items = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(items).toEqual(["＋ Note", "Leave Session", "End Session"]);

    await user.click(screen.getByRole("menuitem", { name: "End Session" }));
    expect(handlers.onEndClick).toHaveBeenCalledOnce();
  });

  it("disables Leave / End (both breakpoints) while a leave or end is in flight, keeping Note usable", async () => {
    const user = userEvent.setup();
    const handlers = renderRegion({ leavePending: true });

    // Desktop inline buttons carry the native disabled attribute.
    expect(screen.getByRole("button", { name: "Leave Session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "End Session" })).toBeDisabled();

    // Mobile overflow items are aria-disabled (stay in the tab order).
    await user.click(screen.getByRole("button", { name: "Session actions" }));
    expect(screen.getByRole("menuitem", { name: "Leave Session" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("menuitem", { name: "Leave Session" }));
    expect(handlers.onLeave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: "＋ Note" }));
    expect(handlers.onCapture).toHaveBeenCalledOnce();
  });

  it("also disables Leave / End (both breakpoints) while an end is in flight (endPending path)", async () => {
    const user = userEvent.setup();
    renderRegion({ endPending: true });
    // Desktop inline buttons.
    expect(screen.getByRole("button", { name: "Leave Session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "End Session" })).toBeDisabled();
    // Mobile overflow items (aria-disabled).
    await user.click(screen.getByRole("button", { name: "Session actions" }));
    expect(screen.getByRole("menuitem", { name: "Leave Session" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "End Session" })).toHaveAttribute("aria-disabled", "true");
  });

  it("surfaces a leave error at both breakpoints when present", () => {
    renderRegion({ leaveError: "Could not leave" });
    // JSDOM renders both the desktop (SessionHeaderControls) and mobile error
    // <p> simultaneously — the error intentionally surfaces at both breakpoints.
    expect(screen.getAllByText("Could not leave")).toHaveLength(2);
  });
});
