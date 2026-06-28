import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import Card from "@/components/ui/Card";
import { axe } from "@/test/axe";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Content</Card>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders no heading when title is omitted", () => {
    render(<Card>Content</Card>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("renders title as a heading when provided", () => {
    render(<Card title="Skills">Content</Card>);
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
  });

  it("defaults the title to an h3", () => {
    render(<Card title="Skills">Content</Card>);
    expect(screen.getByRole("heading", { level: 3, name: "Skills" })).toBeInTheDocument();
  });

  it("renders the title at the requested heading level", () => {
    render(<Card title="Identity" headingLevel={2}>Content</Card>);
    expect(screen.getByRole("heading", { level: 2, name: "Identity" })).toBeInTheDocument();
  });

  it("renders titleAccessory alongside the title", () => {
    render(
      <Card title="Inventory" titleAccessory={<span>Accessory</span>}>
        Content
      </Card>
    );
    expect(screen.getByText("Accessory")).toBeInTheDocument();
    // Both should be present when title is given
    expect(screen.getByRole("heading", { name: "Inventory" })).toBeInTheDocument();
  });

  it("renders no titleAccessory section when title is absent", () => {
    render(
      <Card titleAccessory={<span>Hidden</span>}>Content</Card>
    );
    // Without title the header div is never rendered, so accessory is also absent
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("appends extra className to the section element", () => {
    const { container } = render(<Card className="p-4">Content</Card>);
    expect(container.firstChild).toHaveClass("p-4");
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<Card title="Skills">Content</Card>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
