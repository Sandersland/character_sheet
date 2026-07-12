import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";

import { useAnyDialogOpen, useDialogChrome } from "@/hooks/useDialogChrome";

function Panel({ onClose }: { onClose: () => void }) {
  const panelRef = useDialogChrome(onClose);
  return (
    <div ref={panelRef} tabIndex={-1}>
      <button type="button">Inside</button>
    </div>
  );
}

function CounterProbe() {
  const open = useAnyDialogOpen();
  return <span data-testid="probe">{open ? "open" : "closed"}</span>;
}

function CounterHarness() {
  const [count, setCount] = useState(0);
  return (
    <>
      <CounterProbe />
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        add
      </button>
      <button type="button" onClick={() => setCount((c) => Math.max(0, c - 1))}>
        remove
      </button>
      {Array.from({ length: count }, (_, i) => (
        <Panel key={i} onClose={() => {}} />
      ))}
    </>
  );
}

describe("useDialogChrome", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("focuses the panel with preventScroll: true on mount", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(<Panel onClose={() => {}} />);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("restores the body scroll lock on unmount", () => {
    const { unmount } = render(<Panel onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("useAnyDialogOpen tracks the open-dialog count with mount/unmount symmetry", () => {
    render(<CounterHarness />);
    expect(screen.getByTestId("probe")).toHaveTextContent("closed");

    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("probe")).toHaveTextContent("open");

    // A second dialog keeps it open; closing one still leaves it open.
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("remove"));
    expect(screen.getByTestId("probe")).toHaveTextContent("open");

    // Closing the last dialog clears it.
    fireEvent.click(screen.getByText("remove"));
    expect(screen.getByTestId("probe")).toHaveTextContent("closed");
  });
});
