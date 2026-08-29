import { expect, type Page } from "@playwright/test";

// `campaign` inherits its edition from that campaign; `edition` clicks the
// rules radio directly. Passing both is meaningless — a chosen campaign hides
// the edition picker entirely — so callers pick one.
export async function passEntryGate(page: Page, opts: { campaign?: string; edition?: "2014" | "2024" } = {}): Promise<void> {
  await expect(page.getByRole("heading", { name: "Who's this character for?" })).toBeVisible();
  if (opts.campaign) {
    await page.getByRole("radio", { name: opts.campaign }).click();
  } else if (opts.edition) {
    await page.getByRole("radio", { name: `${opts.edition} rules` }).click();
  }
  await page.getByRole("button", { name: /Continue/ }).click();
}
