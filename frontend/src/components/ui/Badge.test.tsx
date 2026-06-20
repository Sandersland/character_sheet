import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import Badge from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("defaults to neutral tone", () => {
    render(<Badge>label</Badge>);
    const el = screen.getByText("label");
    expect(el).toHaveClass("bg-parchment-100");
    expect(el).toHaveClass("text-parchment-700");
  });

  it.each([
    ["garnet", "bg-garnet-50", "text-garnet-800"],
    ["arcane", "bg-arcane-50", "text-arcane-800"],
    ["gold", "bg-gold-50", "text-gold-800"],
    ["vitality", "bg-vitality-50", "text-vitality-800"],
    ["neutral", "bg-parchment-100", "text-parchment-700"],
  ] as const)("tone=%s applies correct classes", (tone, bgClass, textClass) => {
    render(<Badge tone={tone}>label</Badge>);
    const el = screen.getByText("label");
    expect(el).toHaveClass(bgClass);
    expect(el).toHaveClass(textClass);
  });

  it("appends extra className", () => {
    render(<Badge className="ml-2">label</Badge>);
    expect(screen.getByText("label")).toHaveClass("ml-2");
  });
});
