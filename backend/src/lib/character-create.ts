import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import {
  buildInventoryCreateFromCatalog,
  catalogItemDetailInclude,
  selectAutoEquip,
} from "./inventory.js";
import { ALIGNMENTS, deriveCreatedCharacter, isKnownTool } from "./srd.js";
import { STARTING_EQUIPMENT } from "./starting-equipment.js";
import type { CreateCharacterBody } from "./character-schemas.js";

// Discriminated result: return just the new id so the route re-fetches by id
// with characterInclude and serializes (persist-then-reserialize idiom).
export type CreateCharacterResult =
  | { ok: true; id: string }
  | { ok: false; status: 400; error: string };

// Resolves a list of FixedItemRef-style catalog names + quantities into
// InventoryItem nested-create payloads. Expands pack names via PACK_CONTENTS.
// Fetches all required catalog Items in one query (by name) and returns an
// `error` string if any name is unknown, so the caller can return a 400.
async function resolveFixedItems(
  refs: { catalogName: string; quantity?: number }[]
): Promise<{ inventoryCreates: ReturnType<typeof buildInventoryCreateFromCatalog>[]; error?: string }> {
  // Expand packs via DB — fetch all Pack rows whose name matches a ref.
  const refNames = [...new Set(refs.map((r) => r.catalogName))];
  const packs = await prisma.pack.findMany({
    where: { name: { in: refNames } },
    include: { contents: { include: { item: { select: { name: true } } } } },
  });
  const packByName = new Map(packs.map((p) => [p.name, p]));

  const expanded: { catalogName: string; quantity: number }[] = [];
  for (const ref of refs) {
    const pack = packByName.get(ref.catalogName);
    if (pack) {
      for (const content of pack.contents) {
        expanded.push({ catalogName: content.item.name, quantity: content.quantity * (ref.quantity ?? 1) });
      }
    } else {
      expanded.push({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 });
    }
  }

  const names = [...new Set(expanded.map((r) => r.catalogName))];
  const items = await prisma.item.findMany({
    where: { name: { in: names } },
    include: catalogItemDetailInclude,
  });
  const itemByName = new Map(items.map((i) => [i.name, i]));

  const missing = names.filter((n) => !itemByName.has(n));
  if (missing.length > 0) {
    return { inventoryCreates: [], error: `Unknown catalog items: ${missing.join(", ")}` };
  }

  const inventoryCreates = expanded.map((ref, idx) =>
    buildInventoryCreateFromCatalog(itemByName.get(ref.catalogName)!, { quantity: ref.quantity, position: idx })
  );
  return { inventoryCreates };
}

// POST /characters orchestrator: domain validation + starting-equipment
// resolution + deriveCreatedCharacter + persistence. Returns just the new id;
// the route re-fetches with characterInclude and serializes.
export async function createCharacter(
  input: CreateCharacterBody,
  ownerId: string,
): Promise<CreateCharacterResult> {
  if (!ALIGNMENTS.includes(input.alignment)) {
    return { ok: false, status: 400, error: `Unknown alignment: ${input.alignment}` };
  }

  if (!input.classes.length) {
    return { ok: false, status: 400, error: "At least one class is required" };
  }

  const primaryClassChoice = input.classes[0];

  // Sequential rather than Promise.all: the pg driver adapter's pool can
  // warn/queue when the same PrismaClient fires concurrent queries, and
  // these are cheap point-lookups, so there's no real cost to awaiting
  // each in turn.
  const race = await prisma.race.findUnique({ where: { name: input.race } });
  const characterClass = await prisma.characterClass.findUnique({
    where: { name: primaryClassChoice.name },
  });
  const background = await prisma.background.findUnique({ where: { name: input.background } });

  // Validate subclass choice when provided: must belong to the chosen class
  // and only classes that grant subclasses at level 1 can have one at creation.
  let resolvedSubclassId: string | null = null;
  let resolvedSubclassName: string | null = null;
  if (primaryClassChoice.subclassId && characterClass) {
    const subclass = await prisma.subclass.findUnique({
      where: { id: primaryClassChoice.subclassId },
    });
    if (!subclass) {
      return { ok: false, status: 400, error: `Unknown subclass id: ${primaryClassChoice.subclassId}` };
    }
    if (subclass.classId !== characterClass.id) {
      return {
        ok: false,
        status: 400,
        error: `Subclass "${subclass.name}" does not belong to ${characterClass.name}`,
      };
    }
    if (characterClass.subclassLevel > 1) {
      return {
        ok: false,
        status: 400,
        error: `${characterClass.name} grants its subclass at level ${characterClass.subclassLevel}, not at creation (level 1)`,
      };
    }
    resolvedSubclassId = subclass.id;
    resolvedSubclassName = subclass.name;
  } else if (primaryClassChoice.subclass && !primaryClassChoice.subclassId) {
    // Legacy: plain string subclass name with no id (homebrew / pre-catalog).
    resolvedSubclassName = primaryClassChoice.subclass;
  }

  // Mechanical derivation needs a catalog anchor for race + class. The
  // background only grants skill-proficiency choices (no mechanical
  // fields), so — unlike race/class — it's allowed to be homebrew: an
  // unresolved name is kept as-is with a null backgroundId rather than
  // rejected.
  if (!race) {
    return { ok: false, status: 400, error: `Unknown race: ${input.race}` };
  }
  if (!characterClass) {
    return { ok: false, status: 400, error: `Unknown class: ${primaryClassChoice.name}` };
  }

  const skillProficiencies = input.skillProficiencies ?? [];
  const allowedSkills = new Set([
    ...characterClass.skillChoices,
    ...(background?.skillProficiencies ?? []),
  ]);
  const invalidSkills = skillProficiencies.filter((skill) => !allowedSkills.has(skill));
  if (invalidSkills.length > 0) {
    return { ok: false, status: 400, error: `Invalid skill proficiencies: ${invalidSkills.join(", ")}` };
  }

  const maxSkillChoices = characterClass.skillChoiceCount + (background?.skillProficiencies.length ?? 0);
  if (skillProficiencies.length > maxSkillChoices) {
    return {
      ok: false,
      status: 400,
      error: `Too many skill proficiencies selected (max ${maxSkillChoices})`,
    };
  }

  // ── Tool proficiency validation ─────────────────────────────────────────
  // Fixed grants come from background/class/race — applied server-side.
  // toolChoices in the request are the player's selections from the class
  // toolChoices pool (e.g. 3 instruments for Bard).
  const playerToolChoices = input.toolChoices ?? [];
  if (playerToolChoices.length > 0) {
    const allowedToolChoices = new Set(characterClass.toolChoices);
    const invalidToolChoices = playerToolChoices.filter((t) => !allowedToolChoices.has(t));
    if (invalidToolChoices.length > 0) {
      return {
        ok: false,
        status: 400,
        error: `Invalid tool choices: ${invalidToolChoices.join(", ")}. Must be from the class's toolChoices list.`,
      };
    }
    if (!playerToolChoices.every((t) => isKnownTool(t))) {
      return { ok: false, status: 400, error: "Unknown tool name in toolChoices" };
    }
    if (playerToolChoices.length > characterClass.toolChoiceCount) {
      return {
        ok: false,
        status: 400,
        error: `Too many tool choices (max ${characterClass.toolChoiceCount})`,
      };
    }
  }

  // Assemble creation-fixed tool proficiencies from all three fixed sources.
  // toolChoices (player picks) count as a "class" source.
  const creationToolProfs = [
    ...(background?.toolProficiencies ?? []).map((name) => ({ name, source: "background" as const })),
    ...(characterClass.toolProficiencies ?? []).map((name) => ({ name, source: "class" as const })),
    ...(race?.toolProficiencies ?? []).map((name) => ({ name, source: "race" as const })),
    ...playerToolChoices.map((name) => ({ name, source: "class" as const })),
  ];

  // ── Resolve starting equipment ──────────────────────────────────────────
  // Starting equipment is optional (omitting it creates an empty-inventory
  // character, preserving the existing behaviour and all current tests).
  // When provided, the backend re-resolves authoritatively against the
  // STARTING_EQUIPMENT rules — the frontend only sends choice indices and
  // open-pick item names; it never sends the full item list itself.
  //
  // We use a nested `inventoryItems: { create: [...] }` on character.create
  // rather than calling applyInventoryOperations: the character has no id
  // yet, and starting gear is genesis state, not an economic event — it
  // should not generate ledger rows (same reasoning prisma/seed.ts uses).
  let inventoryItemCreates: ReturnType<typeof buildInventoryCreateFromCatalog>[] = [];
  let startingCurrency: { cp: number; sp: number; gp: number; pp: number } | undefined;

  if (input.startingEquipment) {
    const se = input.startingEquipment;

    if (se.mode === "gold") {
      // Validate gold is within the class's dice range
      const classDef = STARTING_EQUIPMENT[primaryClassChoice.name];
      if (classDef) {
        const { diceCount, diceFaces, multiplier } = classDef.gold;
        const min = diceCount * multiplier;
        const max = diceCount * diceFaces * multiplier;
        if (se.gold < min || se.gold > max) {
          return {
            ok: false,
            status: 400,
            error: `Starting gold must be between ${min} and ${max} for ${primaryClassChoice.name}`,
          };
        }
      }
      startingCurrency = { cp: 0, sp: 0, gp: se.gold, pp: 0 };
    } else {
      // mode === "package"
      const classDef = STARTING_EQUIPMENT[primaryClassChoice.name];
      if (!classDef) {
        return {
          ok: false,
          status: 400,
          error: `No starting equipment package defined for class: ${primaryClassChoice.name}`,
        };
      }

      if (se.selections.length !== classDef.groups.length) {
        return {
          ok: false,
          status: 400,
          error: `Expected ${classDef.groups.length} equipment selections, got ${se.selections.length}`,
        };
      }

      // Collect all fixed items and validate all open picks
      const allFixedRefs: { catalogName: string; quantity: number }[] = [];

      for (let groupIdx = 0; groupIdx < classDef.groups.length; groupIdx++) {
        const group = classDef.groups[groupIdx];
        const sel = se.selections[groupIdx];

        if (sel.optionIndex < 0 || sel.optionIndex >= group.options.length) {
          return {
            ok: false,
            status: 400,
            error: `Equipment group ${groupIdx}: optionIndex ${sel.optionIndex} out of range (0–${group.options.length - 1})`,
          };
        }

        const bundle = group.options[sel.optionIndex];

        // Fixed items in the chosen bundle
        for (const ref of bundle.items ?? []) {
          // Pack names are expanded later in resolveFixedItems
          allFixedRefs.push({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 });
        }

        // Open picks — validate each against its filter
        const openPicks = bundle.openPicks ?? [];
        const providedPicks = sel.openPicks ?? [];
        if (providedPicks.length !== openPicks.length) {
          return {
            ok: false,
            status: 400,
            error: `Equipment group ${groupIdx}, option ${sel.optionIndex}: expected ${openPicks.length} open picks, got ${providedPicks.length}`,
          };
        }

        for (let pickIdx = 0; pickIdx < openPicks.length; pickIdx++) {
          const pickFilter = openPicks[pickIdx].filter;
          const chosenName = providedPicks[pickIdx];

          // Look up the item in the catalog and validate it matches the filter
          const catalogItem = await prisma.item.findUnique({
            where: { name: chosenName },
            include: { weaponDetail: true },
          });

          if (!catalogItem || catalogItem.category !== "weapon") {
            return {
              ok: false,
              status: 400,
              error: `Open pick "${chosenName}" is not a known weapon in the catalog`,
            };
          }
          if (
            pickFilter.weaponClass &&
            catalogItem.weaponDetail?.weaponClass !== pickFilter.weaponClass
          ) {
            return {
              ok: false,
              status: 400,
              error: `Open pick "${chosenName}" does not satisfy filter: weaponClass must be "${pickFilter.weaponClass}"`,
            };
          }
          if (
            pickFilter.range &&
            catalogItem.weaponDetail?.weaponRange !== pickFilter.range
          ) {
            return {
              ok: false,
              status: 400,
              error: `Open pick "${chosenName}" does not satisfy filter: range must be "${pickFilter.range}"`,
            };
          }

          allFixedRefs.push({ catalogName: chosenName, quantity: openPicks[pickIdx].quantity ?? 1 });
        }
      }

      // Resolve all items (expands packs) into InventoryItem create payloads
      const { inventoryCreates, error } = await resolveFixedItems(allFixedRefs);
      if (error) {
        return { ok: false, status: 400, error };
      }
      inventoryItemCreates = inventoryCreates;
    }
  }

  // Auto-equip a new character's starting weapon/armor so the in-session
  // Attack picker isn't empty on a freshly created sheet (issue #51). The 5e
  // selection rule lives in lib/ (selectAutoEquip); the route just applies its
  // decision by flipping `equipped` on the chosen create payloads.
  for (const idx of selectAutoEquip(inventoryItemCreates)) {
    inventoryItemCreates[idx].equipped = true;
  }

  const derived = deriveCreatedCharacter(
    { abilityScores: input.abilityScores, skillProficiencies, toolProficiencies: creationToolProfs },
    { race, characterClass }
  );

  const created = await prisma.character.create({
    data: {
      owner: { connect: { id: ownerId } },
      name: input.name,
      alignment: input.alignment,
      portraitUrl: input.portraitUrl ?? null,
      experiencePoints: input.experiencePoints ?? 0,
      abilityScores: input.abilityScores,
      ...derived,
      // toolProficiencies is ToolProficiencyEntry[] from srd.ts; Prisma
      // expects InputJsonValue for Json columns — safe to cast here.
      toolProficiencies: derived.toolProficiencies as unknown as Prisma.InputJsonValue,
      // Override derived currency with starting gold if the gold path was chosen.
      ...(startingCurrency ? { currency: startingCurrency } : {}),
      // Prisma represents an explicit JSON null distinctly from "field
      // omitted" — derived.spellcasting is the app-level `null`, swapped
      // here for the sentinel Prisma's Json column type expects.
      spellcasting: Prisma.JsonNull,
      raceSelection: { create: { name: input.race, raceId: race.id } },
      backgroundSelection: {
        create: { name: input.background, backgroundId: background?.id ?? null },
      },
      classEntries: {
        create: [
          {
            name: primaryClassChoice.name,
            subclass: resolvedSubclassName,
            subclassId: resolvedSubclassId,
            classId: characterClass.id,
            position: 0,
          },
        ],
      },
      ...(inventoryItemCreates.length > 0
        ? { inventoryItems: { create: inventoryItemCreates } }
        : {}),
    },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}
