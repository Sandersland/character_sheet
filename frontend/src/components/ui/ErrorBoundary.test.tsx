import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import ErrorBoundary from "@/components/ui/ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("catches a throwing child and shows the fallback", () => {
    // React still logs the caught error; silence it to keep test output clean.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to characters" })
    ).toBeInTheDocument();
    // componentDidCatch logged the crash.
    expect(errorSpy).toHaveBeenCalled();
  });

  it("renders a custom fallback when provided", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={(error) => <p>Custom: {error.message}</p>}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom: kaboom")).toBeInTheDocument();
  });
});
