import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import GoldWarningBox, { DiscardedItemsBox } from "@/components/ui/GoldWarningBox";

describe("GoldWarningBox", () => {
  it("renders its children", () => {
    render(<GoldWarningBox>Heads up.</GoldWarningBox>);
    expect(screen.getByText("Heads up.")).toBeInTheDocument();
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
