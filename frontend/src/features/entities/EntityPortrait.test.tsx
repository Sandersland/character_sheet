import { describe, it, expect } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import EntityPortrait from "@/features/entities/EntityPortrait";

const URL_A = "https://example.com/a.png";
const URL_B = "https://example.com/b.png";

describe("EntityPortrait (#844)", () => {
  it("renders the image when portraitUrl is set", () => {
    const { container } = render(
      <EntityPortrait name="Leosin" type="NPC" portraitUrl={URL_A} className="h-11 w-11" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", URL_A);
    expect(container).not.toHaveTextContent("L");
  });

  it("renders the type-tinted monogram when portraitUrl is null", () => {
    const { container } = render(
      <EntityPortrait name="Leosin" type="NPC" portraitUrl={null} className="h-11 w-11" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("L");
  });

  it("falls back to the monogram when the image fails to load", () => {
    const { container } = render(
      <EntityPortrait name="Leosin" type="NPC" portraitUrl={URL_A} className="h-11 w-11" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("L");
  });

  it("re-attempts the image when the URL changes after a failure", () => {
    const { container, rerender } = render(
      <EntityPortrait name="Leosin" type="NPC" portraitUrl={URL_A} className="h-11 w-11" />,
    );
    fireEvent.error(container.querySelector("img")!);
    rerender(
      <EntityPortrait name="Leosin" type="NPC" portraitUrl={URL_B} className="h-11 w-11" />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", URL_B);
  });
});
