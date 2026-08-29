import { afterEach, describe, expect, it, vi } from "vitest";

import { selectAndCopy, writeToClipboard } from "@/lib/clipboard";

// jsdom leaves window.isSecureContext undefined, so gating on it there passes for the wrong reason — never do that.
function stubClipboard(value: unknown) {
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value });
}

function inviteInput(value = "http://192.168.1.20:5173/join/GLIMMERWOOD7") {
  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.value = value;
  document.body.appendChild(input);
  return input;
}

describe("writeToClipboard", () => {
  afterEach(() => {
    delete (window.navigator as { clipboard?: unknown }).clipboard;
  });

  it("returns true once the async write resolves", async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    await expect(writeToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("returns false where navigator.clipboard is absent (insecure contexts)", async () => {
    await expect(writeToClipboard("hello")).resolves.toBe(false);
  });

  it("returns false when the object exists but writeText does not", async () => {
    stubClipboard({});
    await expect(writeToClipboard("hello")).resolves.toBe(false);
  });

  it("returns false when the write is rejected (permission denied)", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
    await expect(writeToClipboard("hello")).resolves.toBe(false);
  });
});

describe("selectAndCopy", () => {
  afterEach(() => {
    delete (document as { execCommand?: unknown }).execCommand;
    document.body.innerHTML = "";
  });

  it("focuses and selects the whole value, then reports execCommand's result", () => {
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    const input = inviteInput();

    expect(selectAndCopy(input)).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("returns false where execCommand is absent but still leaves the text selected", () => {
    const input = inviteInput();

    expect(selectAndCopy(input)).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("returns false when execCommand reports a refused copy", () => {
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    expect(selectAndCopy(inviteInput())).toBe(false);
  });

  it("returns false when execCommand throws", () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => {
        throw new Error("SecurityError");
      },
    });
    const input = inviteInput();

    expect(selectAndCopy(input)).toBe(false);
    expect(input.selectionEnd).toBe(input.value.length);
  });
});
