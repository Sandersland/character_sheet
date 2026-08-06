import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { passEntryGate } from "./helpers/creation";
import { createCharacter, gotoSheet, openSpellbook, uniqueName } from "./helpers/api";

// #1722: exit slice of the 2014 spell catalog epic (#1517) — proves a 2014
// caster's spell experience walks end to end on its OWN catalog, and that
// 2024's stays curated rather than absorbing 2014's full breadth (#1753,
// fixed alongside this spec — see resolveSpellCatalogForEdition's own
// comment in spell-classes.ts for the fallback that used to leak both ways).
// Two caster shapes (#1510's split): Wizard's creation-time SPELLBOOK pick (a
// "known-ish" list) and a Cleric reached post-level-up through the sheet's
// own "Learn a spell" panel (a "prepared" caster has no creation-time list at
// all — level1SpellPicksFor serves `spells: 0` for a 2014 Cleric,
// cantrips-only).

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

  // Dissonant Whispers: EDITION_2024-tagged only (no 2014 row of this name at
  // all) — searching for it against a 2014 character's catalog comes back
  // empty (#1753's fix), proving the panel never leaks the other edition's
  // rows in.
  await search.fill("Dissonant Whispers");
  await expect(page.getByText("No spells match your filter.")).toBeVisible();

  expect(errors).toEqual([]);
});

// #1517/#1753: 2014 is the full PHB'14 breadth, 2024 stays its curated list
// (prisma/seed/spells.ts's own "a curated SRD subset" header) — asserted in
// BOTH directions, plus genuine-fork resolution (a name present under both
// editions still resolves to exactly its OWN edition's row and text).
test("GET /api/spells is edition-scoped: 2014 is the full PHB'14 breadth, 2024 stays curated", async ({ page }) => {
  await login(page);

  const res2014 = await page.request.get("/api/spells?edition=EDITION_2014");
  const res2024 = await page.request.get("/api/spells?edition=EDITION_2024");
  expect(res2014.ok(), `2014 spells: ${res2014.status()}`).toBeTruthy();
  expect(res2024.ok(), `2024 spells: ${res2024.status()}`).toBeTruthy();

  const spells2014 = (await res2014.json()) as { name: string; description: string }[];
  const spells2024 = (await res2024.json()) as { name: string; description: string }[];
  const names2014 = new Set(spells2014.map((s) => s.name));
  const names2024 = new Set(spells2024.map((s) => s.name));

  // The breadth claim: 2014 is the full PHB'14 catalog, 2024 a smaller
  // curated list — a durable relative fact, not a magic-number pin (both
  // grow as content ships).
  expect(names2014.size).toBeGreaterThan(names2024.size * 2);

  // A 2014-only spell (no EDITION_2024 row of this name at all) is served to
  // 2014 and absent from 2024.
  expect(names2014.has("Find Familiar")).toBe(true);
  expect(names2024.has("Find Familiar")).toBe(false);

  // A 2024-only spell (no EDITION_2014 row) is the mirror image.
  expect(names2024.has("Dissonant Whispers")).toBe(true);
  expect(names2014.has("Dissonant Whispers")).toBe(false);

  // A genuine fork still resolves to each edition's own row and text.
  const burningHands2014 = spells2014.find((s) => s.name === "Burning Hands");
  const burningHands2024 = spells2024.find((s) => s.name === "Burning Hands");
  expect(burningHands2014, "Burning Hands served under EDITION_2014").toBeTruthy();
  expect(burningHands2024, "Burning Hands served under EDITION_2024").toBeTruthy();
  expect(burningHands2014!.description).toMatch(/thumbs touching/);
  expect(burningHands2024!.description).not.toMatch(/thumbs touching/);
  expect(burningHands2014!.description).not.toBe(burningHands2024!.description);
});
