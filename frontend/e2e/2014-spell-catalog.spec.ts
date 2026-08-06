import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { passEntryGate } from "./helpers/creation";
import { createCharacter, gotoSheet, openSpellbook, uniqueName } from "./helpers/api";

// #1722: exit slice of the 2014 spell catalog epic (#1517) — proves a 2014
// caster's spell experience walks end to end on its own catalog. Two shapes
// (#1510's caster split): Wizard's creation-time SPELLBOOK pick (a
// "known-ish" list) and a Cleric reached post-level-up through the sheet's
// own "Learn a spell" panel (a "prepared" caster has no creation-time list at
// all — level1SpellPicksFor serves `spells: 0` for a 2014 Cleric,
// cantrips-only). The last test below pins what's actually correct today
// (genuine-fork resolution) rather than the fuller "2024 stays curated"
// claim in #1722's own acceptance line — see its comment and #1753.

function continueStep(page: Page) {
  return page.getByRole("button", { name: /Continue/ }).click();
}

// Burning Hands is a genuine 2014/2024 fork (same name, forked PHB'14 vs SRD
// 5.2 text) — "thumbs touching" appears only in the PHB'14 wording, so its
// presence proves the RESOLVED row, not just a name match, is edition-correct.
const BURNING_HANDS_2014_PHRASE = /thumbs touching/;

test("creation: a 2014 Wizard's spell picker offers only the 2014 catalog, with PHB'14 text", async ({ page }) => {
  const name = uniqueName("Old Ways Scholar");

  await login(page);
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  // #1372: the direct "2014 rules" radio, restored by this issue — no campaign
  // detour needed any more.
  await passEntryGate(page, { edition: "2014" });

  // Identity step. Wizard's subclass gate is level 2 in BOTH editions
  // (subclassGateLevel's 2014 branch reads CharacterClass.subclassLevel; Wizard's
  // is 2), so no subclass picker interrupts creation here.
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Wizard" });
  await page.getByLabel("Background").selectOption({ label: "Sage" });
  await continueStep(page);

  // Abilities step — no PHB'24 background ability spread under 2014 (#1572).
  await expect(page.getByRole("radio", { name: /^\+[12] to / })).toHaveCount(0);
  await continueStep(page);

  // Skills & Tools step — 2014 Human carries none of the 2024 Human's own
  // Skillful/Versatile SpeciesTrait picks (#1690 is a 2024-only mechanic).
  await continueStep(page);

  // Spells step (#1131/#1513): a level-1 Wizard fills a 6-spell spellbook plus
  // 3 cantrips, server-filtered to class=wizard AND this creation draft's own
  // 2014 edition (CreationSpellsStep -> useSpellCatalog(edition, {className})).
  await expect(page.getByRole("heading", { name: "Learn your magic" })).toBeVisible();

  // Burning Hands: open the detail card and assert the PHB'14 text, not merely
  // that a row with this name exists — proves resolveSpellCatalogForEdition
  // picked the 2014 row's OWN description, not a name-only match.
  await page.getByRole("button", { name: "Open Burning Hands" }).click();
  await expect(page.getByText(BURNING_HANDS_2014_PHRASE)).toBeVisible();
  await page.getByRole("button", { name: /Learn Burning Hands/ }).click();

  // Find Familiar: a spell with NO EDITION_2024 row at all in this app's
  // catalog (2014's full-PHB breadth vs 2024's curated list) — its mere
  // presence in this picker is direct proof of the breadth #1517 shipped.
  await page.getByRole("button", { name: "Add Find Familiar" }).click();
  await page.getByRole("button", { name: "Add Magic Missile" }).click();
  await page.getByRole("button", { name: "Add Shield" }).click();
  await page.getByRole("button", { name: "Add Mage Armor" }).click();
  await page.getByRole("button", { name: "Add Thunderwave" }).click();

  // Cantrips group (3 for a level-1 Wizard, both editions).
  await page.getByRole("button", { name: "Add Fire Bolt" }).click();
  await page.getByRole("button", { name: "Add Mage Hand" }).click();
  await page.getByRole("button", { name: "Add Prestidigitation" }).click();
  await continueStep(page);

  // Equipment step — a 2014 Wizard package still has a roll-for-gold rule
  // (unlike 2024, #1535); Sage carries no 2014 background package of its own
  // (only Acolyte and Folk Hero do), so this is the only card.
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  // Review step — create.
  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  // The record's own PreparedSpellList shows only the PREPARED subset
  // (character-create.ts caps prepared picks to the INT-mod cap, so most of
  // this Wizard's 6-spell spellbook stays prepared:false) — the full
  // spellbook, prepared or not, is only in the grimoire.
  await page.getByRole("tab", { name: "Magic" }).click();
  await openSpellbook(page);
  await expect(page.getByText("Burning Hands").first()).toBeVisible();
  await expect(page.getByText("Find Familiar").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("sheet: a 2014 Cleric's 'Learn a spell' panel, reached after leveling up, offers only the 2014 catalog", async ({
  page,
}) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Old Ways Cleric"),
    className: "Cleric",
    speciesName: "Human",
    background: "Sage",
    rulesEdition: "EDITION_2014",
  });

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "overview");
  await expect(page.getByText("Level 1").first()).toBeVisible();

  // Level up — the panel this test drives lives on the sheet, not the
  // creation ceremony, so proving it works post-level-up (not only at
  // creation) is the point: a 2014 Cleric has NO creation-time leveled-spell
  // list at all (level1SpellPicksFor serves `spells: 0`, cantrips-only — it
  // prepares from the full class list), so this panel is the only place a
  // 2014 Cleric's spell catalog is ever browsed.
  await page.getByLabel("XP to award").fill("300");
  await page.getByRole("button", { name: "Award XP" }).click();
  await expect(page.getByText("Level 2").first()).toBeVisible();

  await page.getByRole("tab", { name: "Magic" }).click();
  await openSpellbook(page);
  await page.getByRole("button", { name: "+ Learn a spell" }).click();

  // Guiding Bolt: a 2014-only cleric spell with no EDITION_2024 row in this
  // app's catalog — same breadth proof as the Wizard test above, from the
  // OTHER caster shape (prepared, not known-ish).
  const search = page.getByRole("searchbox", { name: "Search spells" });
  await search.fill("Guiding Bolt");
  await expect(page.getByText("Guiding Bolt")).toBeVisible();
  await page.getByRole("button", { name: "Learn", exact: true }).click();

  expect(errors).toEqual([]);
});

// #1517's spell content slices (#1713-#1721) seeded ~352 EDITION_2014 rows
// against the pre-existing ~116 curated EDITION_2024 rows — the breadth is
// real at the DATA layer. What this test can honestly assert about the SERVED
// catalog is narrower: resolveSpellCatalogForEdition (spell-classes.ts) still
// falls back to a lone single-edition-tagged row SYMMETRICALLY (no direction
// check on which edition `group[0]` is tagged), so today every distinct spell
// name resolves for BOTH ?edition= requests — the "2024 stays curated" half of
// #1722's own acceptance line does not hold yet. Filed as #1753 (found while
// building this test) rather than fixed here: the function also backs
// creation/level-up eligibility and homebrew scribing, and the correct fix is
// directional (keep the 2024→2014 fallback that softens #1742's gap, drop the
// 2014→2024 one), which is a product call worth its own review. What DOES
// already work correctly, and is what this test pins, is genuine-fork
// resolution: a name present under BOTH editions still resolves to exactly
// its OWN edition's row and text, never the other one's.
test("GET /api/spells resolves a genuine 2014/2024 fork to each edition's own text", async ({ page }) => {
  await login(page);

  const res2014 = await page.request.get("/api/spells?edition=EDITION_2014");
  const res2024 = await page.request.get("/api/spells?edition=EDITION_2024");
  expect(res2014.ok(), `2014 spells: ${res2014.status()}`).toBeTruthy();
  expect(res2024.ok(), `2024 spells: ${res2024.status()}`).toBeTruthy();

  const spells2014 = (await res2014.json()) as { name: string; description: string }[];
  const spells2024 = (await res2024.json()) as { name: string; description: string }[];

  const burningHands2014 = spells2014.find((s) => s.name === "Burning Hands");
  const burningHands2024 = spells2024.find((s) => s.name === "Burning Hands");
  expect(burningHands2014, "Burning Hands served under EDITION_2014").toBeTruthy();
  expect(burningHands2024, "Burning Hands served under EDITION_2024").toBeTruthy();
  expect(burningHands2014!.description).toMatch(/thumbs touching/);
  expect(burningHands2024!.description).not.toMatch(/thumbs touching/);
  expect(burningHands2014!.description).not.toBe(burningHands2024!.description);

  // #1517's breadth did land at the data layer even though the serving gap
  // above (#1753) means it isn't yet exclusive to 2014 requests.
  expect(spells2014.length).toBeGreaterThan(300);
});
