import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SessionDoorway from "@/features/session/SessionDoorway";
import type { SessionDoorwaySummary } from "@/features/session/sessionDoorwaySummary";

function renderDoorway(summary: SessionDoorwaySummary, over: Partial<React.ComponentProps<typeof SessionDoorway>> = {}) {
  return render(
    <SessionDoorway
      summary={summary}
      sessionTitle="The Sunless Citadel"
      pending={false}
      error={null}
      onAction={vi.fn()}
      placement="mobile"
      {...over}
    />,
  );
}

describe("SessionDoorway", () => {
  it("renders nothing when the summary is hidden", () => {
    const { container } = renderDoorway({ visible: false, tone: "invite", label: "", sub: null, action: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an action as a button that dispatches onAction", () => {
    const onAction = vi.fn();
    renderDoorway(
      { visible: true, tone: "live", label: "Resume session", sub: "Round 3", action: "resume" },
      { onAction },
    );
    const button = screen.getByRole("button", { name: /resume session, round 3, the sunless citadel/i });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("disables the button while an action is pending", () => {
    renderDoorway(
      { visible: true, tone: "live", label: "Join session", sub: "Live now", action: "join" },
      { pending: true },
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders an informational strip (no button) when the action is null", () => {
    renderDoorway({ visible: true, tone: "scheduled", label: "Next session", sub: "Fri 7:00 · in 2 days", action: null });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an inline action error", () => {
    renderDoorway(
      { visible: true, tone: "invite", label: "Start session", sub: null, action: "start" },
      { error: "Could not start the session." },
    );
    expect(screen.getByText("Could not start the session.")).toBeInTheDocument();
  });
});
