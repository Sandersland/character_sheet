import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Disclosure from "@/components/ui/Disclosure";

describe("Disclosure", () => {
  it("is collapsed by default and hides its content", () => {
    render(
      <Disclosure summary="Coin breakdown">
        <p>hidden body</p>
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: "Coin breakdown" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("hidden body")).not.toBeInTheDocument();
  });

  it("reveals content when toggled open", async () => {
    render(
      <Disclosure summary="Coin breakdown">
        <p>hidden body</p>
      </Disclosure>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Coin breakdown" }));
    expect(screen.getByText("hidden body")).toBeInTheDocument();
  });

  it("respects defaultOpen", () => {
    render(
      <Disclosure summary="Coin breakdown" defaultOpen>
        <p>shown body</p>
      </Disclosure>,
    );
    expect(screen.getByText("shown body")).toBeInTheDocument();
  });
});
