import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EmptyState from "@/components/ui/EmptyState";
import { axe } from "@/test/axe";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders the icon only when provided", () => {
    const { rerender, container } = render(<EmptyState title="Empty" />);
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
    rerender(<EmptyState title="Empty" icon={<svg data-testid="hero" />} />);
    expect(screen.getByTestId("hero")).toBeInTheDocument();
  });

  it("renders the description only when provided", () => {
    const { rerender } = render(<EmptyState title="Empty" />);
    expect(screen.queryByText("Add something.")).toBeNull();
    rerender(<EmptyState title="Empty" description="Add something." />);
    expect(screen.getByText("Add something.")).toBeInTheDocument();
  });

  it("renders the action only when provided", () => {
    const { rerender } = render(<EmptyState title="Empty" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(
      <EmptyState title="Empty" action={{ label: "+ Add", onClick: () => {} }} />,
    );
    expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument();
  });

  it("fires onClick when the action button is pressed", async () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" action={{ label: "+ Add", onClick }} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies md sizing by default", () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.firstChild).toHaveClass("py-10");
  });

  it("applies sm sizing when requested", () => {
    const { container } = render(<EmptyState title="Empty" size="sm" />);
    expect(container.firstChild).toHaveClass("py-6");
  });

  it("merges a custom className", () => {
    const { container } = render(
      <EmptyState title="Empty" className="custom-x" />,
    );
    expect(container.firstChild).toHaveClass("custom-x");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <EmptyState
        icon={<svg />}
        title="Empty"
        description="Add something."
        action={{ label: "+ Add", onClick: () => {} }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
