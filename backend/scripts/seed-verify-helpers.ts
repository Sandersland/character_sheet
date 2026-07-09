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
