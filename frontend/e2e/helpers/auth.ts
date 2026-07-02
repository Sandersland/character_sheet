import type { Page } from "@playwright/test";

// Sign in via the dev-login primitive from the page origin (so the HttpOnly
// cs_session cookie lands same-origin), then reload so the SPA boots authed.
export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async () => {
    await fetch("/api/auth/dev-login", { method: "POST", credentials: "include" });
  });
  await page.reload();
}
