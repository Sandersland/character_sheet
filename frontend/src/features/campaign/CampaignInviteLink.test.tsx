import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import CampaignInviteLink from "@/features/campaign/CampaignInviteLink";
import { axe } from "@/test/axe";

const INVITE_CODE = "GLIMMERWOOD7";
const inviteUrl = () => `${window.location.origin}/join/${INVITE_CODE}`;

// fireEvent, not userEvent.setup(): setup() stubs navigator.clipboard, hiding the insecure-context path this file pins (#1467).
function clickCopy() {
  return act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
  });
}

// jsdom has no navigator.clipboard and leaves window.isSecureContext undefined — never gate on it.
function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function stubExecCommand(impl: () => boolean) {
  Object.defineProperty(document, "execCommand", { configurable: true, value: impl });
}

function invite() {
  return screen.getByRole("textbox", { name: "Invite link" }) as HTMLInputElement;
}

describe("CampaignInviteLink", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window.navigator as { clipboard?: unknown }).clipboard;
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it("renders the join URL for the invite code", () => {
    render(<CampaignInviteLink inviteCode={INVITE_CODE} />);
    expect(invite()).toHaveValue(inviteUrl());
  });

  describe("secure context (async clipboard available)", () => {
    it("writes the join URL and auto-clears the confirmation after 2s", async () => {
      const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      stubClipboard(writeText);
      render(<CampaignInviteLink inviteCode={INVITE_CODE} />);

      await clickCopy();

      expect(writeText).toHaveBeenCalledWith(inviteUrl());
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/copied/i);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("falls through to the manual path when the write is rejected", async () => {
      // Permission-denied rejects rather than throwing synchronously.
      stubClipboard(vi.fn<() => Promise<void>>().mockRejectedValue(new Error("NotAllowedError")));
      render(<CampaignInviteLink inviteCode={INVITE_CODE} />);

      await clickCopy();

      expect(document.activeElement).toBe(invite());
      expect(screen.getByRole("status")).toHaveTextContent(/Ctrl\+C/);
    });
  });

  describe("insecure context (navigator.clipboard absent)", () => {
    it("copies via execCommand when that rung is available", async () => {
      const exec = vi.fn(() => true);
      stubExecCommand(exec);
      render(<CampaignInviteLink inviteCode={INVITE_CODE} />);

      await clickCopy();

      expect(exec).toHaveBeenCalledWith("copy");
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    });

    it("leaves the link focused and fully selected when no copy API works", async () => {
      render(<CampaignInviteLink inviteCode={INVITE_CODE} />);

      await clickCopy();

      expect(document.activeElement).toBe(invite());
      expect(invite().selectionStart).toBe(0);
      expect(invite().selectionEnd).toBe(inviteUrl().length);
    });

    it("keeps the manual instruction on screen past the 2s success window", async () => {
      render(<CampaignInviteLink inviteCode={INVITE_CODE} />);

      await clickCopy();
      expect(screen.getByRole("status")).toHaveTextContent(/copy/i);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByRole("status")).toHaveTextContent(/copy/i);
    });

    it("re-selects the link when the manual state is clicked again", async () => {
      render(<CampaignInviteLink inviteCode={INVITE_CODE} />);

      await clickCopy();
      invite().setSelectionRange(0, 0);

      await clickCopy();

      expect(invite().selectionEnd).toBe(inviteUrl().length);
    });

    it("has no a11y violations in the manual state", async () => {
      const { container } = render(<CampaignInviteLink inviteCode={INVITE_CODE} />);

      await clickCopy();
      // axe-core schedules its own work on real timers; leaving this file's fake
      // timers installed makes the audit never resolve.
      vi.useRealTimers();

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
