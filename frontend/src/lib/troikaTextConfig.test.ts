import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock must be declared before importing the module under test.
vi.mock("troika-three-text", () => ({
  configureTextBuilder: vi.fn(),
}));

import { configureTextBuilder } from "troika-three-text";
import { configureDiceText } from "@/lib/troikaTextConfig";

describe("configureDiceText (#408)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables the troika Web Worker so text builds on the main thread", () => {
    configureDiceText();
    expect(vi.mocked(configureTextBuilder)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(configureTextBuilder)).toHaveBeenCalledWith({ useWorker: false });
  });
});
