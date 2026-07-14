import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GrowingComposer from "@/features/journal/GrowingComposer";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn().mockResolvedValue([]),
  createEntity: vi.fn(),
}));

function setup(overrides: Partial<React.ComponentProps<typeof GrowingComposer>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<GrowingComposer busy={false} error={null} onSave={onSave} {...overrides} />);
  return { onSave };
}

beforeEach(() => vi.clearAllMocks());

describe("GrowingComposer (#865)", () => {
  it("starts one line tall as a pill (rounded-full field)", () => {
    setup();
    // editor (contenteditable) → MentionAutocomplete's .relative wrapper → field
    const editor = screen.getByRole("textbox", { name: /quick note/i });
    const field = editor.parentElement?.parentElement;
    expect(field?.className).toContain("rounded-full");
  });

  it("Enter saves the trimmed body; Shift+Enter does not", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    const editor = screen.getByRole("textbox", { name: /quick note/i });

    await user.type(editor, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSave).not.toHaveBeenCalled();

    await user.type(editor, "line two");
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatch(/line one[\s\S]*line two/);
  });

  it("does not save an empty (whitespace-only) note", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    await user.type(screen.getByRole("textbox", { name: /quick note/i }), "   ");
    await user.keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Enter during IME composition does NOT submit", () => {
    const { onSave } = setup();
    const editor = screen.getByRole("textbox", { name: /quick note/i });
    editor.textContent = "日本語";
    fireEvent.input(editor);
    fireEvent.keyDown(editor, { key: "Enter", isComposing: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clears the field after a successful save", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    const editor = screen.getByRole("textbox", { name: /quick note/i });
    await user.type(editor, "captured");
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalled();
    expect(editor.textContent ?? "").toBe("");
  });

  it("the circular send button saves and is disabled while empty", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    const send = screen.getByRole("button", { name: /save note/i });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /quick note/i }), "via send");
    expect(send).toBeEnabled();
    await user.click(send);
    expect(onSave).toHaveBeenCalledWith("via send", undefined);
  });

  it("sends visibility PRIVATE when the lock is toggled, then resets it", async () => {
    const user = userEvent.setup();
    const { onSave } = setup({ campaignId: "camp-1" });
    await user.click(screen.getByRole("checkbox", { name: /private/i }));
    await user.type(screen.getByRole("textbox", { name: /quick note/i }), "secret");
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledWith("secret", "PRIVATE");
    // Privacy never leaks forward — the toggle resets after a successful save.
    expect(screen.getByRole("checkbox", { name: /private/i })).not.toBeChecked();
  });

  it("hides the lock toggle for a campaign-less character", () => {
    setup();
    expect(screen.queryByRole("checkbox", { name: /private/i })).toBeNull();
  });

  it("hides the keyboard hint when showHints is false (mobile)", () => {
    setup({ showHints: false });
    expect(screen.queryByText(/↵ save/i)).toBeNull();
  });
});
