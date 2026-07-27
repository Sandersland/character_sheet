import { expect, type Page } from "@playwright/test";

// #1286: the entry gate resolves rulesEdition (and, when the dev user already
// has campaigns from another spec, which one) before the creation ceremony's
// Identity step is reachable at all. Solo + the 2024 default are pre-selected,
// so any spec that just wants to walk the ceremony accepts them with one click.
//
// #1371 gates the picker so 2014 can never be chosen directly — reaching a 2014
// character now means inheriting from a 2014 campaign, so `campaign` (the
// campaign card's accessible name) selects that card instead of a rules radio.
// #1372 (the ungate) restores a direct edition-selection path here.
export async function passEntryGate(page: Page, opts: { campaign?: string } = {}): Promise<void> {
  await expect(page.getByRole("heading", { name: "Who's this character for?" })).toBeVisible();
  if (opts.campaign) {
    await page.getByRole("radio", { name: opts.campaign }).click();
  }
  await page.getByRole("button", { name: /Continue/ }).click();
}
