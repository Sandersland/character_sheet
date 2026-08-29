import { useQuery } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { getQueryClient } from "@/api/queryClient";

// Proves the setupFiles-level provider mechanism reaches every test file's render/renderHook, which is what lets existing test files keep calling a bare render.
function Probe() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: () => Promise.resolve("ok") });
  return <div>{data ?? "loading"}</div>;
}

function ProbeWithRoute() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: () => Promise.resolve("ok") });
  const location = useLocation();
  return (
    <div>
      {data ?? "loading"} @ {location.pathname}
    </div>
  );
}

describe("query harness", () => {
  it("a component calling useQuery renders without an explicit provider", () => {
    render(<Probe />);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  // This test and the next are a pair: one writes, the next proves the fresh per-test client dropped it. Splitting or reordering them defeats both.
  it("the cache does not bleed between tests", () => {
    getQueryClient().setQueryData(["bleed"], "leftover");
    expect(getQueryClient().getQueryData(["bleed"])).toBe("leftover");
  });

  it("does not see the previous test's cache entry", () => {
    expect(getQueryClient().getQueryData(["bleed"])).toBeUndefined();
  });

  it("a test's own wrapper still applies", () => {
    render(<ProbeWithRoute />, { wrapper: MemoryRouter });
    expect(screen.getByText("loading @ /")).toBeInTheDocument();
  });

  it("retries are off", async () => {
    const { result } = renderHook(() =>
      useQuery({ queryKey: ["probe-error"], queryFn: () => Promise.reject(new Error("nope")) }),
    );
    // The short timeout is the assertion: retry's first backoff is ~1s, so a query that retried could not reach isError inside this window.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 250 });
  });
});
