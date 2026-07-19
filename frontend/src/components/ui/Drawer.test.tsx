import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Drawer from "@/components/ui/Drawer";

describe("Drawer", () => {
  it("renders its title + children in a labelled dialog", () => {
    render(
      <Drawer title="Session Log" onClose={vi.fn()}>
        <p>drawer body</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog", { name: "Session Log" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("drawer body")).toBeInTheDocument();
  });

  it("closes on the Close button and on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer title="Session Log" onClose={onClose}>
        <p>drawer body</p>
      </Drawer>,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
