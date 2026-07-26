import { expect, type Page } from "@playwright/test";

// #1286: the entry gate resolves rulesEdition (and, when the dev user already
// has campaigns from another spec, which one) before the creation ceremony's
// Identity step is reachable at all. Solo + the 2024 default are pre-selected,
// so any spec that just wants to walk the ceremony accepts them with one click.
export async function passEntryGate(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Who's this character for?" })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
}
