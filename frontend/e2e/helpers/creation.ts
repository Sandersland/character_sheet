import { expect, type Page } from "@playwright/test";

// #1286: the entry gate resolves rulesEdition (and, when the dev user already
// has campaigns from another spec, which one) before the creation ceremony's
// Identity step is reachable at all. Solo + the 2024 default are pre-selected,
// so any spec that just wants to walk the ceremony accepts them with one click.
//
// Two ways to land on 2014: `campaign` inherits it from a 2014 campaign card
// (the pre-#1372 route, still real — a player joining a 2014 table never sees
// a picker at all); `edition` clicks the "2014 rules" radio directly, the path
// #1372 restored. Passing both is meaningless (a chosen campaign hides the
// picker entirely), so callers pick one.
export async function passEntryGate(page: Page, opts: { campaign?: string; edition?: "2014" | "2024" } = {}): Promise<void> {
  await expect(page.getByRole("heading", { name: "Who's this character for?" })).toBeVisible();
  if (opts.campaign) {
    await page.getByRole("radio", { name: opts.campaign }).click();
  } else if (opts.edition) {
    await page.getByRole("radio", { name: `${opts.edition} rules` }).click();
  }
  await page.getByRole("button", { name: /Continue/ }).click();
}
