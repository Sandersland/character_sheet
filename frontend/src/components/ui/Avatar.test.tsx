import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "@/test/axe";

import Avatar from "@/components/ui/Avatar";

describe("Avatar", () => {
  it("renders the image when imageUrl is set", () => {
    const { container } = render(
      <Avatar name="Ada Lovelace" email="ada@x.dev" imageUrl="https://x.dev/a.png" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://x.dev/a.png");
    expect(img).toHaveAttribute("alt", "");
  });

  it("derives two-letter initials from a two-word name", () => {
    render(<Avatar name="Ada Lovelace" email={null} imageUrl={null} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("derives a single initial from a single-word name", () => {
    render(<Avatar name="Ada" email={null} imageUrl={null} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("falls back to the email initial when there is no name", () => {
    render(<Avatar name={null} email="zed@x.dev" imageUrl={null} />);
    expect(screen.getByText("Z")).toBeInTheDocument();
  });

  it("uses a generic fallback when there is no name or email", () => {
    render(<Avatar name={null} email={null} imageUrl={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Avatar name="Ada Lovelace" email="ada@x.dev" imageUrl={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
