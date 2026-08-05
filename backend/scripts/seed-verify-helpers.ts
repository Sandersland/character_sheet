// Pure helpers for seed-verify.ts (no HTTP, no side effects) so the class-choice
// selection can be unit-tested without a running backend.

export type RefClass = {
  name: string;
  subclassLevel: number | null;
  subclasses: { id: string }[];
};

export type ClassChoice = { name: string; subclassId?: string };

export type PickedClass = {
  chosenClass: RefClass;
  needsSubclass: boolean;
  classChoice: ClassChoice;
};

// Prefer a class that does NOT pick its subclass at level 1 (e.g. Fighter), so
// we don't need to supply a subclassId. Fall back to the first class + its first
// subclass id if every class grants a subclass at creation.
export function pickClassChoice(classes: RefClass[]): PickedClass {
  const noSubclass = classes.find((c) => c.subclassLevel == null || c.subclassLevel > 1);
  const chosenClass = noSubclass ?? classes[0];
  const needsSubclass = !noSubclass;
  const classChoice: ClassChoice = needsSubclass
    ? { name: chosenClass.name, subclassId: chosenClass.subclasses[0]?.id }
    : { name: chosenClass.name };
  if (needsSubclass && !classChoice.subclassId) {
    throw new Error(`class "${chosenClass.name}" needs a subclass at L1 but the catalog has none`);
  }
  return { chosenClass, needsSubclass, classChoice };
}

// A species' own ability-increase entries (#1679's three-shape union) —
// only the discriminant fields pickSpecies needs to tell "fixed" (safe) apart
// from "choose"/"floating" (needs a speciesAbilities field this script
// doesn't supply), never the full AbilityIncreaseSpec shape.
export type RefSpeciesAbilityIncrease = { ability?: string; choose?: unknown; floating?: number };

export type RefSpecies = {
  id: string;
  name: string;
  variants: { id: string }[];
  abilityIncreases: RefSpeciesAbilityIncrease[];
  needsCastingAbility: boolean;
  chooseSkills: unknown;
  chooseCantrip: unknown;
  chooseOriginFeat: boolean;
};

export type SpeciesChoice = { speciesId: string; variantId?: string };

// Prefer a species that needs NO extra creation fields at all: no variant
// picker, no 2014 ability-increase choice/floating pool (speciesAbilities),
// and no 2024 species-level skill/cantrip/Origin-feat/casting-ability pick
// (speciesSkills/speciesCantripId/speciesOriginFeatId/castingAbility,
// #1683/#1689/#1690) — mirrors pickClassChoice's own "avoid the complicated
// path" strategy above, so this script's create body never has to grow one
// of those extra fields. Falls back to the first species + its first variant
// id when every seeded species under this edition needs one.
export function pickSpecies(species: RefSpecies[]): SpeciesChoice {
  const simple = species.find(
    (s) =>
      s.variants.length === 0 &&
      s.abilityIncreases.every((inc) => "ability" in inc) &&
      !s.needsCastingAbility &&
      !s.chooseSkills &&
      !s.chooseCantrip &&
      !s.chooseOriginFeat,
  );
  if (simple) return { speciesId: simple.id };
  const fallback = species[0];
  const variantId = fallback.variants[0]?.id;
  if (!variantId) {
    throw new Error(
      `species "${fallback.name}" needs extra creation fields this script doesn't supply, and the catalog has no variant fallback either`,
    );
  }
  return { speciesId: fallback.id, variantId };
}

export type CatalogRow = { id: string; name: string; weapon?: unknown; armor?: unknown };

// Pick an equippable weapon + armor and two sellable trinkets, and build the
// acquire ops for them.
export function planInventory(items: CatalogRow[]) {
  const weapon = items.find((i) => i.weapon);
  const armor = items.find((i) => i.armor);
  const trinkets = items.filter((i) => !i.weapon && !i.armor).slice(0, 2);
  const acquireOps = [
    weapon && { type: "acquire", itemId: weapon.id, quantity: 1, equipped: true },
    armor && { type: "acquire", itemId: armor.id, quantity: 1, equipped: true },
    ...trinkets.map((t) => ({ type: "acquire", itemId: t.id, quantity: 3 })),
  ].filter(Boolean);
  return { acquireOps, trinketIds: new Set(trinkets.map((t) => t.id)) };
}

// GET /api/reference's edition-scoped lists a fresh seed must never ship
// empty (#1506) — species/classes/backgrounds (creation itself would 400
// without them) PLUS universalActions/conditions, the two edition-FORKED
// lists (Action/Condition rows carry an `edition` column, #1430/#1322) that
// a half-shipped edition can leave empty while races/classes/backgrounds
// still resolve fine off the shared/NULL rows — exactly the "half-deployed
// pair" failure seedActions' own prune comment warns about. Pure + no HTTP,
// so a missing-content edition is provable without a running backend.
export type ReferenceCatalog = {
  species: unknown[];
  classes: unknown[];
  backgrounds: unknown[];
  conditions: unknown[];
  universalActions: unknown[];
};

const CATALOG_LISTS = ["species", "classes", "backgrounds", "conditions", "universalActions"] as const;

// Returns an error message naming every empty list, or null when the catalog
// is fully populated for the requested edition.
export function assertCatalogPopulated(ref: ReferenceCatalog): string | null {
  const empty = CATALOG_LISTS.filter((key) => !ref[key]?.length);
  if (empty.length === 0) return null;
  return `catalog is empty for ${empty.join(", ")} — run the DB seed first (the dev stack does this on boot)`;
}
