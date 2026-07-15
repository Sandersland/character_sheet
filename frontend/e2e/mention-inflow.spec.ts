import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

// #785: below md the @-mention suggestions must render in-flow inside the
// Quick-capture BottomSheet — scrollable and clear of the sheet edge — not as an
// absolute popover that clips under the on-screen keyboard. Desktop keeps the
// popover. Here we seed a campaign with several entities, attach the character,
// and drive the mobile flow.
test("Quick capture: @-mention suggestions render in-flow and unclipped on mobile", async ({
  page,
}) => {
  await login(page);
  const errors = collectConsoleErrors(page);

  const characterId = await createCharacter(page.request, {
    name: uniqueName("Mention Mobile"),
    className: "Fighter",
  });
  const campaignResponse = await page.request.post("/api/campaigns", {
    data: { name: uniqueName("E2E Mentions") },
  });
  expect(campaignResponse.ok(), `create campaign: ${campaignResponse.status()}`).toBeTruthy();
  const { id: campaignId } = (await campaignResponse.json()) as { id: string };
  const attach = await page.request.post(`/api/campaigns/${campaignId}/characters`, {
    data: { characterId },
  });
  expect(attach.ok(), `attach character: ${attach.status()}`).toBeTruthy();

  const names = ["Aldric", "Alvara", "Aldwin", "Alfheim", "Alister", "Alrek"];
  for (const name of names) {
    const res = await page.request.post(`/api/campaigns/${campaignId}/entities`, {
      data: { type: "NPC", name },
    });
    expect(res.ok(), `create entity ${name}: ${res.status()}`).toBeTruthy();
  }

  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto(`/characters/${characterId}`);
  // Gate on the always-on banner (Quick capture is banner-driven, tab-agnostic).
  await expect(page.getByRole("heading", { name: /Mention Mobile/, level: 1 })).toBeVisible();

  // Open the mobile Quick-capture BottomSheet and type an @-query.
  await page.keyboard.press("Control+j");
  const composer = page.getByRole("textbox", { name: /quick note/i });
  await expect(composer).toBeFocused();
  await composer.pressSequentially("@Al");

  // The in-flow suggestion list shows, several rows visible, unclipped by the
  // viewport bottom (no absolute popover hanging off the sheet edge).
  const listbox = page.getByRole("listbox", { name: /tag suggestions/i });
  await expect(listbox).toBeVisible();
  const options = listbox.getByRole("option");
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeGreaterThanOrEqual(4);

  const box = await listbox.boundingBox();
  expect(box, "listbox has a layout box").not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);

  // Keyboard nav selects; arrowing keeps a highlighted active option.
  await composer.press("ArrowDown");
  await expect(listbox.locator('[aria-selected="true"]')).toHaveCount(1);
  await composer.press("Enter");
  await expect(page.getByRole("listbox", { name: /tag suggestions/i })).toHaveCount(0);

  expect(errors).toEqual([]);
});
