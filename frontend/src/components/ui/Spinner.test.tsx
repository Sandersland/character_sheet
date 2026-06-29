import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import Spinner from "@/components/ui/Spinner";
import { axe } from "@/test/axe";

describe("Spinner", () => {
  it("exposes a status role with accessible loading text", () => {
    render(<Spinner />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Loading…");
  });

  it("uses a full-screen centered container for the page variant", () => {
    const { container } = render(<Spinner variant="page" />);
    expect(container.firstChild).toHaveClass("min-h-screen");
  });

  it("uses an inline container by default", () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).not.toHaveClass("min-h-screen");
  });

  it("merges a custom className", () => {
    const { container } = render(<Spinner className="custom-x" />);
    expect(container.firstChild).toHaveClass("custom-x");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Spinner variant="page" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
