import { expect, type Page } from "@playwright/test";

// Sign in via the dev-login primitive from the page origin (so the HttpOnly
// cs_session cookie lands same-origin), then reload so the SPA boots authed.
// Verifies the authed shell rendered before returning — a bare reload can race
// the auth boot and leave the SPA on the sign-in page, which would then break a
// follow-up navigation. Retries the dev-login a few times to absorb that.
export async function login(page: Page): Promise<void> {
  await page.goto("/");
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(async () => {
      await fetch("/api/auth/dev-login", { method: "POST", credentials: "include" });
    });
    await page.reload();
    // Gate on the authed shell directly; a bounded per-attempt wait keeps the
    // whole retry loop well under the test timeout even on a slow first boot.
    const authed = await page
      .getByRole("link", { name: "New Character" })
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (authed) return;
  }
  // Surface a clear failure if we never reached the authed shell.
  await expect(page.getByRole("link", { name: "New Character" }).first()).toBeVisible();
}
