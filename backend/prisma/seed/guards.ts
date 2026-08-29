import type { SeedEdition } from "./edition.js";

// GrantedAbility.name is unique per (name, edition) (#1415); NULLS NOT DISTINCT admits only one shared row per name, hence `?? "shared"` rather than a skip.
export function assertUniqueGrantedAbilityNames(abilities: { name: string; edition?: SeedEdition }[]): void {
  const keys = abilities.map((a) => `${a.name}::${a.edition ?? "shared"}`);
  const at = keys.findIndex((key, i) => keys.indexOf(key) !== i);
  if (at !== -1)
    throw new Error(
      `Seed error: duplicate GrantedAbility name "${abilities[at].name}" (edition: ${abilities[at].edition ?? "shared"}) across maneuvers/shadow-arts/channel-divinity/subclass-choices`,
    );
}
