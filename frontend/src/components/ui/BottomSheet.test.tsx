import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BottomSheet from "@/components/ui/BottomSheet";

describe("BottomSheet", () => {
  it("renders the title, subtitle and children", () => {
    render(
      <BottomSheet title="Action" subtitle="Pick one" onClose={vi.fn()}>
        <button type="button">Attack</button>
      </BottomSheet>,
    );
    expect(screen.getByRole("heading", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByText("Pick one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attack" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="Action" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="Action" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the scrim is clicked", async () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    const scrim = baseElement.querySelector('[role="presentation"]') as HTMLElement;
    await userEvent.pointer({ target: scrim, keys: "[MouseLeft]" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops the grabber handle on desktop (md+) — it's a thumb-drag affordance", () => {
    const { baseElement } = render(
      <BottomSheet title="Action" onClose={vi.fn()}>
        <p>body</p>
      </BottomSheet>,
    );
    const grabber = baseElement.querySelector('span[aria-hidden="true"]');
    expect(grabber).not.toBeNull();
    expect(grabber!.className).toContain("md:hidden");
  });
});
