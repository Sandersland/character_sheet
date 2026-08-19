import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import GoldWarningBox, { DiscardedItemsBox } from "@/components/ui/GoldWarningBox";

describe("GoldWarningBox", () => {
  it("renders its children", () => {
    render(<GoldWarningBox>Heads up.</GoldWarningBox>);
    expect(screen.getByText("Heads up.")).toBeInTheDocument();
  });

  it("accepts a custom icon in place of the default TriangleAlert", () => {
    render(
      <GoldWarningBox icon={<svg data-testid="custom-icon" />}>Heads up.</GoldWarningBox>,
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("'row' variant renders a circled icon badge beside its children, not the bare 'callout' icon", () => {
    const { container } = render(
      <GoldWarningBox variant="row" icon={<svg data-testid="row-icon" />}>
        <div>Poisoned</div>
      </GoldWarningBox>,
    );
    expect(screen.getByTestId("row-icon")).toBeInTheDocument();
    expect(container.querySelector(".rounded-control.bg-gold-400")).toBeInTheDocument();
  });
});

describe("DiscardedItemsBox", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(<DiscardedItemsBox heading="Discarded" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading and every item's label", () => {
    render(
      <DiscardedItemsBox
        heading="Discarded with lili"
        items={[
          { key: "notes", label: "Description/notes" },
          { key: "visibility", label: "Hidden visibility" },
        ]}
      />,
    );
    expect(screen.getByText("Discarded with lili")).toBeInTheDocument();
    expect(screen.getByText("Description/notes")).toBeInTheDocument();
    expect(screen.getByText("Hidden visibility")).toBeInTheDocument();
  });
});
