import { expect, type Page } from "@playwright/test";

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(async () => {
      await fetch("/api/auth/dev-login", { method: "POST", credentials: "include" });
    });
    await page.reload();
    const authed = await page
      .getByRole("link", { name: "New Character" })
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (authed) return;
  }
  await expect(page.getByRole("link", { name: "New Character" }).first()).toBeVisible();
}
