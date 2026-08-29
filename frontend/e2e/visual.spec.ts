import { expect, test, type Locator, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import {
  createCharacter,
  createSessionCharacter,
  enterLiveCombat,
  gotoSheet,
  learnSpells,
  uniqueName,
} from "./helpers/api";
import { passEntryGate } from "./helpers/creation";

const WIZARD_L5_XP = 6500;

async function pinFonts(page: Page): Promise<void> {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

// The specs share one backend user, so real inbox rows — and the bell + badge
// pixels they add to every header — depend on what campaign/entity state
// earlier specs left behind.
async function pinInbox(page: Page): Promise<void> {
  await page.route("**/api/inbox", (route) => route.fulfill({ json: [] }));
}

// Pins both the pre-paint local value (addInitScript, read before the SPA
// boots) and the server value: PreferencesProvider re-adopts the server's
// stored preferences as authoritative on every load, so without the server
// PATCH too, an earlier spec's write would override this pin on the next
// /auth/me fetch — read as a UI regression, not a broken fixture, so the PATCH
// result is asserted rather than fire-and-forget.
async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("cs:pref:theme", t);
    } catch {
      // private-mode restriction — fall through to the default theme
    }
  }, theme);
  const res = await page.request.patch("/api/preferences", {
    data: { theme, diceRollStyle: "animated", autoRollConcentration: true },
  });
  expect(res.ok(), `pinning server preferences failed: ${res.status()}`).toBe(true);
}

// A Card renders as a <section> carrying its title heading — a stable, name-free
// handle for scoped screenshots.
function sectionByTitle(page: Page, title: string): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
}

async function ready(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

test("visual: character sheet — light theme", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Sheet Hero"),
    className: "Fighter",
    background: "Soldier",
  });

  await setTheme(page, "light");
  await gotoSheet(page, id, "combat");
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();
  await ready(page);

  await expect(page).toHaveScreenshot("sheet-light.png", {
    fullPage: true,
    mask: [page.getByRole("heading", { level: 1 })],
    maxDiffPixelRatio: 0.02,
  });
});

test("visual: character sheet — dark theme", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Sheet Hero"),
    className: "Fighter",
    background: "Soldier",
  });

  await setTheme(page, "dark");
  await gotoSheet(page, id, "combat");
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();
  await ready(page);

  await expect(page).toHaveScreenshot("sheet-dark.png", {
    fullPage: true,
    mask: [page.getByRole("heading", { level: 1 })],
    maxDiffPixelRatio: 0.02,
  });
});

test("visual: inventory section and ledger modal", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Pack Hero"),
    className: "Fighter",
    background: "Soldier",
  });

  await setTheme(page, "light");
  await gotoSheet(page, id, "inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+ Add item" }).first().click();
  await page.getByLabel("Item").selectOption({ label: "Dagger" });
  await page.getByLabel("gp", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/1x · 1 lb/)).toBeVisible();
  await ready(page);

  await expect(sectionByTitle(page, "Inventory")).toHaveScreenshot("inventory-section.png", {
    maxDiffPixelRatio: 0.01,
  });

  await page.getByRole("button", { name: "Activity" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Dagger").first()).toBeVisible();
  await ready(page);

  await expect(dialog).toHaveScreenshot("inventory-ledger-modal.png", {
    maxDiffPixelRatio: 0.03,
  });
});

test("visual: spells section", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Spell Mage"),
    className: "Wizard",
    experiencePoints: WIZARD_L5_XP,
  });
  await learnSpells(page.request, id, ["Fire Bolt", "Magic Missile"]);

  await setTheme(page, "light");
  await gotoSheet(page, id, "magic");
  await expect(page.getByRole("heading", { name: "Spell Slots" })).toBeVisible();
  await ready(page);

  await expect(page.locator("#sheet-panel-magic")).toHaveScreenshot("spells-section.png", {
    maxDiffPixelRatio: 0.01,
  });
});

test("visual: session / turn view", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  const id = await createSessionCharacter(page.request, {
    name: uniqueName("Turn Fighter"),
    className: "Fighter",
    background: "Soldier",
  });

  await setTheme(page, "light");
  await page.goto(`/characters/${id}`);
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);
  await expect(page.getByRole("button", { name: /Start combat/i })).toBeVisible();
  await ready(page);

  // <main> excludes the title bar (character name), so this is name-free.
  await expect(page.locator("main")).toHaveScreenshot("session-turn-view.png", {
    maxDiffPixelRatio: 0.02,
  });
});

test("visual: creation ceremony — steps", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  await setTheme(page, "light");

  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page);
  await expect(page.getByLabel(/^Name/)).toBeVisible();
  await ready(page);

  await expect(page).toHaveScreenshot("creation-step1.png", {
    maxDiffPixelRatio: 0.01,
  });

  // A fixed name (not uniqueName) keeps the "Forging · …" kicker pixels stable.
  await page.getByLabel(/^Name/).fill("Aria Brightwood");
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Fighter" });
  await page.getByLabel("Background").selectOption({ label: "Soldier" });
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Origin feat: Savage Attacker")).toBeVisible();
  await ready(page);

  await expect(page).toHaveScreenshot("creation-step2.png", {
    maxDiffPixelRatio: 0.02,
  });
});

// The sheet-dark fullPage baseline's diff tolerance is loose enough to pass
// unchanged even on a real brand-surface regression — these two tight, scoped
// shots exist to make that kind of color drift an actual gate.
test("visual: brand surfaces — dark, desktop", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Brand Hero"),
    className: "Fighter",
    background: "Soldier",
  });

  await setTheme(page, "dark");
  await gotoSheet(page, id, "combat");
  const tablist = page.getByRole("tablist", { name: "Section tabs" });
  const doorway = page.getByRole("button", { name: "Start session" });
  await expect(doorway).toBeVisible();
  await ready(page);

  const tabBox = await tablist.boundingBox();
  const doorwayBox = await doorway.boundingBox();
  if (!tabBox || !doorwayBox) throw new Error("brand-surface region not visible");
  const x = Math.min(tabBox.x, doorwayBox.x);
  const clip = {
    x,
    y: tabBox.y,
    width: Math.max(tabBox.x + tabBox.width, doorwayBox.x + doorwayBox.width) - x,
    height: doorwayBox.y + doorwayBox.height - tabBox.y,
  };

  await expect(page).toHaveScreenshot("brand-surfaces-dark.png", {
    clip,
    maxDiffPixelRatio: 0.001,
  });
});

test("visual: bottom nav — dark, mobile", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  await pinInbox(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Nav Hero"),
    className: "Fighter",
    background: "Soldier",
  });

  // md:hidden, and every other spec here runs at 1280×800 — this is its only coverage.
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, "dark");
  await gotoSheet(page, id, "overview");
  const nav = page.getByRole("navigation", { name: "Sheet sections" });
  await expect(nav).toBeVisible();
  await ready(page);

  await expect(nav).toHaveScreenshot("bottom-nav-dark.png", {
    maxDiffPixelRatio: 0,
  });
});
