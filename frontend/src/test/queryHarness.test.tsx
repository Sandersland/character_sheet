import { useQuery } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { getQueryClient } from "@/api/queryClient";

// [RULING 2] probe: proves whether the setupFiles-level provider mechanism
// actually reaches every test file's `render`/`renderHook`. Test #1 must be run
// FIRST, against no harness, to confirm the RED baseline before the mechanism
// is built (see PR body for the verbatim failure).
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
    // No waitFor: with retry disabled the query settles to isError on the next
    // tick, not after a retry backoff — one `setTimeout(0)` flush is enough to
    // observe it, no polling required.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.isError).toBe(true);
  });
});
