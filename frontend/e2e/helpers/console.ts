import type { Page } from "@playwright/test";

// Collect console errors + uncaught page errors into a live array a spec can
// assert is empty. Attach before navigating so early errors are captured.
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
