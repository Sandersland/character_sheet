import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { useDialogChrome } from "@/hooks/useDialogChrome";

function Panel({ onClose }: { onClose: () => void }) {
  const panelRef = useDialogChrome(onClose);
  return (
    <div ref={panelRef} tabIndex={-1}>
      <button type="button">Inside</button>
    </div>
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
});
