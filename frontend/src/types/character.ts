/**
 * Barrel for the character wire types, split by domain under ./character/.
 * This file (character.ts) resolves ahead of the character/ dir, so every
 * `@/types/character` import stays valid with zero call-site churn.
 */
export * from "./character/primitives";
export * from "./character/inventory";
export * from "./character/activity";
export * from "./character/spells";
export * from "./character/journal";
export * from "./character/classes";
export * from "./character/combat";
export * from "./character/leveling";
export * from "./character/actions";
export * from "./character/campaign";
export * from "./character/reference";
export * from "./character/sheet";
export * from "./character/session";
