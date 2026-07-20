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

// Visual regression baselines for the key screens. Baselines live in
// e2e/__screenshots__/ (checked in) and are regenerated with
// `npm run e2e:update-snapshots` when a visual change is intentional.
//
// Determinism: animations/caret are frozen in playwright.config; each spec pins
// fonts to the e2e image's bundled set (blocking the Google Fonts network load)
// and waits for document.fonts.ready. Character names (the only per-run-unique
// pixels on full-page shots) are masked; scoped section/modal shots exclude the
// name entirely.

const WIZARD_L5_XP = 6500;

// Block the Google Fonts stylesheet + files so text falls back to the pinned
// e2e image's local fonts — identical at baseline-capture and comparison time.
async function pinFonts(page: Page): Promise<void> {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

// Pin the theme before the SPA boots so the pre-paint script in index.html reads
// it (addInitScript runs before page scripts on the next navigation).
async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("cs:pref:theme", t);
    } catch {
      // private-mode restriction — fall through to the default theme
    }
  }, theme);
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
  const id = await createCharacter(page.request, {
    name: uniqueName("Sheet Hero"),
    className: "Fighter",
    race: "Human",
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
  const id = await createCharacter(page.request, {
    name: uniqueName("Sheet Hero"),
    className: "Fighter",
    race: "Human",
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
  const id = await createCharacter(page.request, {
    name: uniqueName("Pack Hero"),
    className: "Fighter",
    race: "Human",
    background: "Soldier",
  });

  await setTheme(page, "light");
  await gotoSheet(page, id, "inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  // Acquire one catalog Dagger so both the inventory row and its ledger event are
  // present and deterministic (fixed name/weight; the ledger groups it under TODAY).
  await page.getByRole("button", { name: "+ Add item" }).first().click();
  await page.getByLabel("Item").selectOption({ label: "Dagger" });
  await page.getByLabel("gp", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/1x · 1 lb/)).toBeVisible();
  await ready(page);

  await expect(sectionByTitle(page, "Inventory")).toHaveScreenshot("inventory-section.png", {
    maxDiffPixelRatio: 0.01,
  });

  // Ledger (the Character Activity modal — this app's audit log with LIFO undo).
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

  // The Magic tab's default view is the self-styled spellcasting record block
  // (quick-cast + slot pips); the grimoire is a separate view behind "Manage
  // spellbook →". Snapshot the record — the tab panel's default state.
  await expect(page.locator("#sheet-panel-magic")).toHaveScreenshot("spells-section.png", {
    maxDiffPixelRatio: 0.01,
  });
});

test("visual: session / turn view", async ({ page }) => {
  await login(page);
  await pinFonts(page);
  const id = await createSessionCharacter(page.request, {
    name: uniqueName("Turn Fighter"),
    className: "Fighter",
    race: "Human",
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
  await setTheme(page, "light");

  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  // The ceremony (#1176) opens on the Identity step behind the dark stage.
  await expect(page.getByLabel(/^Name/)).toBeVisible();
  await ready(page);

  // Step 1 — the empty Identity step (a fresh browser context starts draft-free).
  await expect(page).toHaveScreenshot("creation-step1.png", {
    maxDiffPixelRatio: 0.01,
  });

  // Step 2 — identity chosen, advanced to the Abilities step (Soldier's 2024
  // spread). A fixed name keeps the "Forging · …" kicker pixels stable.
  await page.getByLabel(/^Name/).fill("Aria Brightwood");
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Race/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Fighter" });
  await page.getByLabel("Background").selectOption({ label: "Soldier" });
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Origin feat: Savage Attacker")).toBeVisible();
  await ready(page);

  await expect(page).toHaveScreenshot("creation-step2.png", {
    maxDiffPixelRatio: 0.02,
  });
});
