import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import Field from "@/components/ui/Field";

describe("Field", () => {
  it("associates the label with the control via htmlFor", () => {
    render(
      <Field label="Name" htmlFor="n">
        <input id="n" />
      </Field>,
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("shows a required marker when required", () => {
    render(
      <Field label="Name" htmlFor="n" required>
        <input id="n" />
      </Field>,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders the hint when no error", () => {
    render(
      <Field label="Name" hint="be brief">
        <input />
      </Field>,
    );
    expect(screen.getByText("be brief")).toBeInTheDocument();
  });

  it("error takes precedence over hint", () => {
    render(
      <Field label="Name" hint="be brief" error="required">
        <input />
      </Field>,
    );
    expect(screen.getByText("required")).toBeInTheDocument();
    expect(screen.queryByText("be brief")).not.toBeInTheDocument();
  });
});
