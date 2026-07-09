import { describe, it, expect } from "vitest";

import { errorMessage } from "@/lib/errorMessage";

describe("errorMessage", () => {
  it("returns the Error's message", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("returns the fallback for a non-Error throw", () => {
    expect(errorMessage("nope", "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
  });
});
