import { expect, type Page } from "@playwright/test";

// #1286: the entry gate resolves rulesEdition (and, when the dev user already
// has campaigns from another spec, which one) before the creation ceremony's
// Identity step is reachable at all. Solo + the 2024 default are pre-selected,
// so any spec that just wants to walk the ceremony accepts them with one click.
//
// `edition` defaults to "EDITION_2024" (the pre-selected radio) so every
// existing single-arg call site is untouched (#1325) — pass "EDITION_2014" to
// pick the other radio before Continue.
export async function passEntryGate(page: Page, opts: { edition?: "EDITION_2014" | "EDITION_2024" } = {}): Promise<void> {
  await expect(page.getByRole("heading", { name: "Who's this character for?" })).toBeVisible();
  if (opts.edition === "EDITION_2014") {
    await page.getByRole("radio", { name: "2014 rules" }).click();
  }
  await page.getByRole("button", { name: /Continue/ }).click();
}
